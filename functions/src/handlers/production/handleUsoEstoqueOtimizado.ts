import * as admin from 'firebase-admin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  LancamentoProducao,
  UsoEstoquePayload,
  LancamentoProducaoTipoEvento,
  GrupoProducaoOtimizado,
  GrupoMontagem,
  LancamentoProduto
} from '../../types/productionTypes';
import { logger } from 'firebase-functions';

// Função para criar lançamentos de saída de estoque
async function criarLancamentosSaidaEstoque(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  posicoesConsumidas: UsoEstoquePayload['posicoesConsumidas'],
  usuarioId: string,
  pedidoId: string
) {
  for (const posicao of posicoesConsumidas) {
    const { produtoId, produtoTipo, posicaoEstoqueId, quantidade } = posicao;
    
    // Criar lançamento de produto
    const lancamentoProduto: LancamentoProduto = {
      id: '', // Será gerado pelo Firestore
      produtoId: produtoId,
      tipoProduto: produtoTipo as 'parte' | 'peca' | 'modelo' | 'kit',
      tipoMovimento: 'saida',
      quantidade: quantidade,
      usuario: usuarioId,
      observacao: `Uso de estoque para pedido ${pedidoId}`,
      data: admin.firestore.FieldValue.serverTimestamp(),
      locais: [{
        recipienteId: posicaoEstoqueId,
        quantidade: quantidade
      }]
    };

    // Criar documento no Firestore
    const lancamentoRef = db.collection('lancamentosProdutos').doc();
    transaction.create(lancamentoRef, {
      ...lancamentoProduto,
      id: lancamentoRef.id
    });

    logger.info(`Lançamento de saída criado para produto ${produtoId}: ${quantidade} unidades`);
  }
}

// Função para coletar referências de grupos de montagem (FASE 1: LEITURAS)
async function coletarGruposMontagemParaLeitura(
  db: admin.firestore.Firestore,
  gruposMontagemAfetados: UsoEstoquePayload['gruposMontagemAfetados']
): Promise<Array<{ grupoRef: admin.firestore.DocumentReference; grupoId: string; modificacoes: any[] }>> {
  if (!gruposMontagemAfetados || gruposMontagemAfetados.length === 0) {
    return [];
  }

  const gruposParaLer = gruposMontagemAfetados.map(grupoAfetado => ({
    grupoRef: db.collection('gruposMontagem').doc(grupoAfetado.grupoMontagemId),
    grupoId: grupoAfetado.grupoMontagemId,
    modificacoes: grupoAfetado.modificacoes
  }));

  return gruposParaLer;
}

// Função para aplicar modificações em grupos de montagem (FASE 3: ESCRITAS) - MVP SIMPLIFICADO
async function aplicarModificacoesGruposMontagem(
  transaction: admin.firestore.Transaction,
  gruposParaAtualizar: Array<{
    grupoRef: admin.firestore.DocumentReference;
    grupoDoc: admin.firestore.DocumentSnapshot;
    modificacoes: any[];
  }>
) {
  if (gruposParaAtualizar.length === 0) {
    logger.info('Nenhum grupo de montagem para atualizar');
    return;
  }

  logger.info(`MVP: Aplicando modificações em ${gruposParaAtualizar.length} grupos de montagem`);

  for (const { grupoRef, grupoDoc, modificacoes } of gruposParaAtualizar) {
    try {
      if (!grupoDoc.exists) {
        logger.warn(`Grupo de montagem ${grupoRef.id} não encontrado`);
        continue;
      }
      
      const grupo = grupoDoc.data() as GrupoMontagem;
      const updatedGrupo: Partial<GrupoMontagem> = { ...grupo };
      
      // Processar cada modificação
      for (const modificacao of modificacoes) {
        const { campo, valor } = modificacao;
        
        if (campo === 'atendimentoDetalhado') {
          const { origem, quantidade, produtoRaizId, produtoRaizTipo } = valor;
          logger.info(`MVP: Adicionando atendimentoDetalhado para ${produtoRaizId} (${produtoRaizTipo})`);
          
          // Criar novo atendimento - usar Timestamp.now() em vez de FieldValue.serverTimestamp()
          // porque FieldValue não pode ser usado dentro de arrays no Firestore
          const novoAtendimento = {
            origem: origem,
            quantidade: quantidade,
            timestamp: admin.firestore.Timestamp.now()
          };
          
          // LÓGICA CORRIGIDA: Usar targetProductType do grupo para determinar estrutura
          const targetProductType = grupo.targetProductType;
          
          // 1. GRUPO DE MODELO: Atender todas as pecasNecessarias
          if (targetProductType === 'modelo' && grupo.pecasNecessarias) {
            logger.info(`Grupo ${grupoRef.id} é modelo, atendendo todas as ${grupo.pecasNecessarias.length} peças`);
            const updatedPecas = grupo.pecasNecessarias.map(peca => {
              // Adicionar atendimento em TODAS as peças (kit atende modelo inteiro)
              const atendimentoExistenteIndex = peca.atendimentoDetalhado?.findIndex(
                (a: any) => a.origem === origem
              ) ?? -1;
              
              if (atendimentoExistenteIndex >= 0) {
                // Atualizar quantidade existente
                const atendimentoExistente = peca.atendimentoDetalhado![atendimentoExistenteIndex];
                peca.atendimentoDetalhado![atendimentoExistenteIndex] = {
                  ...atendimentoExistente,
                  quantidade: (atendimentoExistente.quantidade || 0) + quantidade,
                  timestamp: admin.firestore.Timestamp.now()
                };
              } else {
                // Adicionar novo atendimento
                peca.atendimentoDetalhado = [...(peca.atendimentoDetalhado || []), novoAtendimento];
              }
              return peca;
            });
            updatedGrupo.pecasNecessarias = updatedPecas;
          }
          
          // 2. GRUPO DE PEÇA: Atender todas as partesNecessarias
          else if (targetProductType === 'peca' && grupo.partesNecessarias) {
            logger.info(`Grupo ${grupoRef.id} é peça, atendendo todas as ${grupo.partesNecessarias.length} partes`);
            const updatedPartes = grupo.partesNecessarias.map(parte => {
              // Adicionar atendimento em TODAS as partes
              const atendimentoExistenteIndex = parte.atendimentoDetalhado?.findIndex(
                (a: any) => a.origem === origem
              ) ?? -1;
              
              if (atendimentoExistenteIndex >= 0) {
                // Atualizar quantidade existente
                const atendimentoExistente = parte.atendimentoDetalhado![atendimentoExistenteIndex];
                parte.atendimentoDetalhado![atendimentoExistenteIndex] = {
                  ...atendimentoExistente,
                  quantidade: (atendimentoExistente.quantidade || 0) + quantidade,
                  timestamp: admin.firestore.Timestamp.now()
                };
              } else {
                // Adicionar novo atendimento
                parte.atendimentoDetalhado = [...(parte.atendimentoDetalhado || []), novoAtendimento];
              }
              return parte;
            });
            updatedGrupo.partesNecessarias = updatedPartes;
          }
          
          // 3. GRUPO DE KIT: Atender pecasNecessarias e/ou modelosNecessarios
          else if (targetProductType === 'kit') {
            logger.info(`Grupo ${grupoRef.id} é kit`);
            
            // Atender pecasNecessarias se existirem
            if (grupo.pecasNecessarias) {
              logger.info(`Atendendo ${grupo.pecasNecessarias.length} peças do kit`);
              const updatedPecas = grupo.pecasNecessarias.map(peca => {
                const atendimentoExistenteIndex = peca.atendimentoDetalhado?.findIndex(
                  (a: any) => a.origem === origem
                ) ?? -1;
                
                if (atendimentoExistenteIndex >= 0) {
                  const atendimentoExistente = peca.atendimentoDetalhado![atendimentoExistenteIndex];
                  peca.atendimentoDetalhado![atendimentoExistenteIndex] = {
                    ...atendimentoExistente,
                    quantidade: (atendimentoExistente.quantidade || 0) + quantidade,
                    timestamp: admin.firestore.Timestamp.now()
                  };
                } else {
                  peca.atendimentoDetalhado = [...(peca.atendimentoDetalhado || []), novoAtendimento];
                }
                return peca;
              });
              updatedGrupo.pecasNecessarias = updatedPecas;
            }
            
            // Atender modelosNecessarios se existirem
            if (grupo.modelosNecessarios) {
              logger.info(`Atendendo ${grupo.modelosNecessarios.length} modelos do kit`);
              const updatedModelos = grupo.modelosNecessarios.map(modelo => {
                const atendimentoExistenteIndex = modelo.atendimentoDetalhado?.findIndex(
                  (a: any) => a.origem === origem
                ) ?? -1;
                
                if (atendimentoExistenteIndex >= 0) {
                  const atendimentoExistente = modelo.atendimentoDetalhado![atendimentoExistenteIndex];
                  modelo.atendimentoDetalhado![atendimentoExistenteIndex] = {
                    ...atendimentoExistente,
                    quantidade: (atendimentoExistente.quantidade || 0) + quantidade,
                    timestamp: admin.firestore.Timestamp.now()
                  };
                } else {
                  modelo.atendimentoDetalhado = [...(modelo.atendimentoDetalhado || []), novoAtendimento];
                }
                return modelo;
              });
              updatedGrupo.modelosNecessarios = updatedModelos;
            }
          }
          
          // 4. FALLBACK: Se não encontrou estrutura, tentar lógica antiga (para compatibilidade)
          else {
            logger.warn(`Grupo ${grupoRef.id} não tem estrutura reconhecida, usando fallback`);
            // Lógica antiga mantida para compatibilidade
            if (produtoRaizTipo === 'peca' && grupo.pecasNecessarias) {
              const updatedPecas = grupo.pecasNecessarias.map(peca => {
                if (peca.pecaId === produtoRaizId) {
                  const atendimentoExistenteIndex = peca.atendimentoDetalhado?.findIndex(
                    (a: any) => a.origem === origem
                  ) ?? -1;
                  
                  if (atendimentoExistenteIndex >= 0) {
                    const atendimentoExistente = peca.atendimentoDetalhado![atendimentoExistenteIndex];
                    peca.atendimentoDetalhado![atendimentoExistenteIndex] = {
                      ...atendimentoExistente,
                      quantidade: (atendimentoExistente.quantidade || 0) + quantidade,
                      timestamp: admin.firestore.Timestamp.now()
                    };
                  } else {
                    peca.atendimentoDetalhado = [...(peca.atendimentoDetalhado || []), novoAtendimento];
                  }
                }
                return peca;
              });
              updatedGrupo.pecasNecessarias = updatedPecas;
            }
          }
          
          logger.info(`MVP: Atendimento adicionado/atualizado para grupo ${grupoRef.id}`);
        }
      }
      
      // Verificar se o grupo está completamente atendido após as modificações
      const grupoCompletamenteAtendido = verificarGrupoCompletamenteAtendido(updatedGrupo as GrupoMontagem);
      if (grupoCompletamenteAtendido) {
        updatedGrupo.status = 'concluido_por_estoque';
        logger.info(`Grupo de montagem ${grupoRef.id} completamente atendido por estoque, status atualizado para 'concluido_por_estoque'`);
      }
      
      transaction.update(grupoRef, updatedGrupo);
      logger.info(`Grupo de montagem ${grupoRef.id} atualizado com sucesso`);
      
    } catch (error) {
      logger.error(`Erro ao atualizar grupo de montagem ${grupoRef.id}:`, error);
    }
  }
}

// Função para coletar referências de grupos de produção (FASE 1: LEITURAS)
async function coletarGruposProducaoParaLeitura(
  db: admin.firestore.Firestore,
  gruposProducaoAfetados: UsoEstoquePayload['gruposProducaoAfetados']
): Promise<Array<{ grupoRef: admin.firestore.DocumentReference; grupoId: string; modificacoes: any }>> {
  if (!gruposProducaoAfetados || gruposProducaoAfetados.length === 0) {
    return [];
  }

  const gruposParaLer = gruposProducaoAfetados.map(grupoAfetado => ({
    grupoRef: db.collection('gruposProducaoOtimizados').doc(grupoAfetado.grupoProducaoId),
    grupoId: grupoAfetado.grupoProducaoId,
    modificacoes: grupoAfetado.modificacoes
  }));

  return gruposParaLer;
}

// Função para aplicar modificações em grupos de produção (FASE 3: ESCRITAS)
async function aplicarModificacoesGruposProducao(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  gruposParaAtualizar: Array<{
    grupoRef: admin.firestore.DocumentReference;
    grupoDoc: admin.firestore.DocumentSnapshot;
    modificacoes: any;
  }>,
  pedidoId: string,
  gruposProducaoAfetados: UsoEstoquePayload['gruposProducaoAfetados']
) {
  if (gruposParaAtualizar.length === 0) {
    logger.info('Nenhum grupo de produção para atualizar');
    return;
  }

  logger.info(`Aplicando modificações em ${gruposParaAtualizar.length} grupos de produção`);

  for (const { grupoRef, grupoDoc, modificacoes } of gruposParaAtualizar) {
    try {
      if (!grupoDoc.exists) {
        logger.warn(`Grupo de produção ${grupoRef.id} não encontrado`);
        continue;
      }
      
      const grupo = grupoDoc.data() as GrupoProducaoOtimizado;
      
      // LOG DETALHADO: Mostrar o grupo antes das modificações
      logger.info(`Processando grupo ${grupoRef.id}:`);
      logger.info(`- Status atual: ${grupo.status}`);
      logger.info(`- quantidadeProduzirGrupo: ${grupo.quantidadeProduzirGrupo}`);
      logger.info(`- totalPartsQuantity: ${grupo.totalPartsQuantity}`);
      logger.info(`- quantidadeOriginalGrupo: ${grupo.quantidadeOriginalGrupo}`);
      logger.info(`- Número de pedidosOrigem: ${grupo.pedidosOrigem?.length || 0}`);
      
      // Obter assemblyInstances do payload para este grupo específico
      const grupoAfetadoPayload = gruposProducaoAfetados?.find(
        (g: any) => g.grupoProducaoId === grupoRef.id
      );
      
      const assemblyInstancesDoPayload = grupoAfetadoPayload?.assemblyInstances || [];
      logger.info(`Assembly instances do payload para este grupo: ${assemblyInstancesDoPayload.length}`);
      
      // Se não há modificações ou partesNoGrupo, pular
      if (!modificacoes || !grupo.partesNoGrupo) {
        logger.warn(`Grupo ${grupoRef.id} não tem partesNoGrupo ou modificacoes`);
        continue;
      }
      
      // 1. CRIAR CÓPIA DO GRUPO ORIGINAL PARA O GRUPO ATENDIDO
      const grupoAtendido: GrupoProducaoOtimizado = {
        ...grupo,
        id: undefined, // Novo ID será gerado pelo Firestore
        status: 'concluido_por_estoque' as const,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        startedAt: grupo.startedAt || null,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        quantidadeProduzirGrupo: 0, // Será calculado
        totalPartsQuantity: 0, // Será calculado
        partesNoGrupo: { ...grupo.partesNoGrupo },
        pedidosOrigem: grupo.pedidosOrigem ? [...grupo.pedidosOrigem] : []
      };
      
      // 2. ATUALIZAR GRUPO ORIGINAL (remover partes atendidas)
      const updatedGrupo: Partial<GrupoProducaoOtimizado> = { ...grupo };
      const updatedPartesNoGrupo = { ...grupo.partesNoGrupo };
      const updatedPartesNoGrupoAtendido = { ...grupo.partesNoGrupo };
      
      let totalPartsQuantityOriginal = 0;
      let totalPartsQuantityAtendido = 0;
      
      logger.info(`Aplicando ${Object.keys(modificacoes).length} modificações`);
      
      // Processar cada modificação
      for (const [campoPath, valor] of Object.entries(modificacoes)) {
        logger.info(`Modificação: ${campoPath} = ${valor}`);
        
        if (campoPath.startsWith('partesNoGrupo.')) {
          const parteId = campoPath.replace('partesNoGrupo.', '').split('.')[0];
          logger.info(`Parte ID extraída: ${parteId}`);
          
          if (updatedPartesNoGrupo[parteId]) {
            const quantidadeAtual = updatedPartesNoGrupo[parteId].quantidade;
            const quantidadeConsumida = Math.abs(valor as number); // Valor é negativo para consumo
            const novaQuantidade = Math.max(0, quantidadeAtual - quantidadeConsumida);
            
            logger.info(`Quantidade: ${quantidadeAtual} - ${quantidadeConsumida} = ${novaQuantidade}`);
            
            // Atualizar grupo original (reduzir quantidade)
            updatedPartesNoGrupo[parteId] = {
              ...updatedPartesNoGrupo[parteId],
              quantidade: novaQuantidade
            };
            
            // Grupo atendido fica com a quantidade consumida
            updatedPartesNoGrupoAtendido[parteId] = {
              ...updatedPartesNoGrupoAtendido[parteId],
              quantidade: quantidadeConsumida
            };
            
            // Verificar se parte ainda tem quantidade no grupo original
            if (novaQuantidade > 0) {
              logger.info(`Parte ${parteId} ainda tem quantidade > 0 no grupo original`);
            } else {
              logger.info(`Parte ${parteId} quantidade = 0 no grupo original`);
            }
          } else {
            logger.warn(`Parte ${parteId} não encontrada no grupo`);
          }
        }
      }
      
      // Calcular quantidades totais
      totalPartsQuantityOriginal = Object.values(updatedPartesNoGrupo).reduce(
        (sum, parte) => sum + parte.quantidade, 0
      );
      
      totalPartsQuantityAtendido = Object.values(updatedPartesNoGrupoAtendido).reduce(
        (sum, parte) => sum + parte.quantidade, 0
      );
      
      logger.info(`Nova totalPartsQuantity (original): ${totalPartsQuantityOriginal} (anterior: ${grupo.totalPartsQuantity})`);
      logger.info(`TotalPartsQuantity (atendido): ${totalPartsQuantityAtendido}`);
      
      // 3. CALCULAR PROPORÇÃO BASEADA EM ASSEMBLYINSTANCES
      // Contar total de assemblyInstances no grupo
      let totalAssemblyInstances = 0;
      let assemblyInstancesAtendidos = assemblyInstancesDoPayload.length;
      
      if (grupo.pedidosOrigem && Array.isArray(grupo.pedidosOrigem)) {
        totalAssemblyInstances = grupo.pedidosOrigem.reduce((total, pedido) => 
          total + (pedido.assemblyInstances?.length || 0), 0
        );
      }
      
      logger.info(`AssemblyInstances: ${assemblyInstancesAtendidos} atendidos de ${totalAssemblyInstances} totais`);
      
      // Calcular proporção atendida (baseada em assemblyInstances, não quantidade de partes)
      const proporcaoAtendida = totalAssemblyInstances > 0 ? assemblyInstancesAtendidos / totalAssemblyInstances : 0;
      const proporcaoRestante = 1 - proporcaoAtendida;
      
      logger.info(`Proporção: ${proporcaoAtendida.toFixed(2)} atendida, ${proporcaoRestante.toFixed(2)} restante`);
      
      // 4. ATUALIZAR PEDIDOSORIGEM EM AMBOS OS GRUPOS
      if (grupo.pedidosOrigem && Array.isArray(grupo.pedidosOrigem)) {
        logger.info(`Grupo tem ${grupo.pedidosOrigem.length} pedidos de origem`);
        
        // Filtrar pedidosOrigem para o grupo original (remover pedidos completamente atendidos)
        const updatedPedidosOrigemOriginal: any[] = [];
        const updatedPedidosOrigemAtendido: any[] = [];
        
        for (const pedido of grupo.pedidosOrigem) {
          // Verificar se este pedido está sendo atendido (tem assemblyInstances no payload)
          const pedidoEstaSendoAtendido = pedido.assemblyInstances?.some((instance: any) => 
            assemblyInstancesDoPayload.includes(instance.assemblyInstanceId)
          ) || false; // NÃO usar pedido.pedidoId === pedidoId!
          
          if (pedidoEstaSendoAtendido) {
            // Para o grupo atendido: manter apenas os assemblyInstances atendidos
            const assemblyInstancesAtendidos = pedido.assemblyInstances?.filter((instance: any) => 
              assemblyInstancesDoPayload.includes(instance.assemblyInstanceId)
            ) || [];
            
            if (assemblyInstancesAtendidos.length > 0) {
              updatedPedidosOrigemAtendido.push({
                ...pedido,
                assemblyInstances: assemblyInstancesAtendidos
              });
            }
            
            // Para o grupo original: remover os assemblyInstances atendidos
            const assemblyInstancesRestantes = pedido.assemblyInstances?.filter((instance: any) => 
              !assemblyInstancesDoPayload.includes(instance.assemblyInstanceId)
            ) || [];
            
            if (assemblyInstancesRestantes.length > 0) {
              updatedPedidosOrigemOriginal.push({
                ...pedido,
                assemblyInstances: assemblyInstancesRestantes
              });
            }
          } else {
            // Pedido não está sendo atendido, mantém APENAS no grupo original
            updatedPedidosOrigemOriginal.push(pedido);
            // NÃO adicionar a updatedPedidosOrigemAtendido!
          }
        }
        
        // Atualizar pedidosOrigem nos grupos
        updatedGrupo.pedidosOrigem = updatedPedidosOrigemOriginal;
        grupoAtendido.pedidosOrigem = updatedPedidosOrigemAtendido;
        
        logger.info(`PedidosOrigem após divisão: ${updatedPedidosOrigemOriginal.length} no original, ${updatedPedidosOrigemAtendido.length} no atendido`);
        
        // 5. ATUALIZAR QUANTIDADES BASEADAS NA PROPORÇÃO
        // Recalcular totalPartsQuantity baseado na proporção
        totalPartsQuantityOriginal = Math.round(grupo.totalPartsQuantity * proporcaoRestante);
        totalPartsQuantityAtendido = Math.round(grupo.totalPartsQuantity * proporcaoAtendida);
        
        logger.info(`Quantidades recalculadas: ${totalPartsQuantityOriginal} original, ${totalPartsQuantityAtendido} atendido`);
        
        // Atualizar partesNoGrupo baseado na proporção
        Object.keys(updatedPartesNoGrupo).forEach(parteId => {
          const parteOriginal = grupo.partesNoGrupo[parteId];
          if (parteOriginal) {
            // Grupo original: proporção restante
            updatedPartesNoGrupo[parteId] = {
              ...parteOriginal,
              quantidade: Math.round(parteOriginal.quantidade * proporcaoRestante)
            };
            
            // Grupo atendido: proporção atendida
            updatedPartesNoGrupoAtendido[parteId] = {
              ...parteOriginal,
              quantidade: Math.round(parteOriginal.quantidade * proporcaoAtendida)
            };
          }
        });
        
        // 6. ATUALIZAR GRUPO ORIGINAL (SEMPRE, exceto se quantidade zero)
        if (totalPartsQuantityOriginal > 0) {
          updatedGrupo.partesNoGrupo = updatedPartesNoGrupo;
          updatedGrupo.quantidadeProduzirGrupo = totalPartsQuantityOriginal;
          updatedGrupo.totalPartsQuantity = totalPartsQuantityOriginal;
          updatedGrupo.quantidadeOriginalGrupo = totalPartsQuantityOriginal;
          
          // Atualizar status do grupo original (MANTER STATUS ORIGINAL)
          updatedGrupo.status = grupo.status; // Sempre manter o status original
          
          // Log para depuração
          if (grupo.status !== updatedGrupo.status) {
            logger.warn(`Status do grupo ${grupoRef.id} alterado de ${grupo.status} para ${updatedGrupo.status}`);
          }
          
          // Atualizar tempoImpressaoGrupo e consumoFilamentoGrupo proporcionalmente
          if (grupo.quantidadeOriginalGrupo > 0) {
            updatedGrupo.tempoImpressaoGrupo = Math.round(grupo.tempoImpressaoGrupo * proporcaoRestante);
            updatedGrupo.consumoFilamentoGrupo = Math.round(grupo.consumoFilamentoGrupo * proporcaoRestante);
          }
          
          // Atualizar filamentosNecessarios e outrosInsumosNecessarios para grupo original
          if (grupo.filamentosNecessarios) {
            updatedGrupo.filamentosNecessarios = grupo.filamentosNecessarios.map(filamento => ({
              ...filamento,
              quantidade: Math.round(filamento.quantidade * proporcaoRestante)
            }));
          }
          
          if (grupo.outrosInsumosNecessarios) {
            updatedGrupo.outrosInsumosNecessarios = grupo.outrosInsumosNecessarios.map(insumo => ({
              ...insumo,
              quantidade: typeof insumo.quantidade === 'number' 
                ? Math.round(insumo.quantidade * proporcaoRestante)
                : insumo.quantidade
            }));
          }
          
          transaction.update(grupoRef, updatedGrupo);
          logger.info(`Grupo original ${grupoRef.id} atualizado com ${totalPartsQuantityOriginal} partes`);
        } else {
          // Se quantidade zero, deletar grupo original
          logger.info(`Grupo ${grupoRef.id} tem quantidade zero, será removido`);
          transaction.delete(grupoRef);
        }
        
        // 7. CRIAR GRUPO ATENDIDO se houver quantidade atendida
        if (totalPartsQuantityAtendido > 0) {
          // Atualizar grupo atendido
          grupoAtendido.partesNoGrupo = updatedPartesNoGrupoAtendido;
          grupoAtendido.quantidadeProduzirGrupo = totalPartsQuantityAtendido;
          grupoAtendido.totalPartsQuantity = totalPartsQuantityAtendido;
          grupoAtendido.quantidadeOriginalGrupo = totalPartsQuantityAtendido;
          
          // Atualizar tempoImpressaoGrupo e consumoFilamentoGrupo proporcionalmente
          if (grupo.quantidadeOriginalGrupo > 0) {
            grupoAtendido.tempoImpressaoGrupo = Math.round(grupo.tempoImpressaoGrupo * proporcaoAtendida);
            grupoAtendido.consumoFilamentoGrupo = Math.round(grupo.consumoFilamentoGrupo * proporcaoAtendida);
          }
          
          // Atualizar filamentosNecessarios e outrosInsumosNecessarios proporcionalmente
          if (grupo.filamentosNecessarios) {
            grupoAtendido.filamentosNecessarios = grupo.filamentosNecessarios.map(filamento => ({
              ...filamento,
              quantidade: Math.round(filamento.quantidade * proporcaoAtendida)
            }));
          }
          
          if (grupo.outrosInsumosNecessarios) {
            grupoAtendido.outrosInsumosNecessarios = grupo.outrosInsumosNecessarios.map(insumo => ({
              ...insumo,
              quantidade: typeof insumo.quantidade === 'number' 
                ? Math.round(insumo.quantidade * proporcaoAtendida)
                : insumo.quantidade
            }));
          }
          
          // Criar novo documento para o grupo atendido
          const grupoAtendidoRef = db.collection('gruposProducaoOtimizados').doc();
          transaction.create(grupoAtendidoRef, {
            ...grupoAtendido,
            id: grupoAtendidoRef.id
          });
          
          logger.info(`Grupo atendido criado: ${grupoAtendidoRef.id} com status 'concluido_por_estoque'`);
        }
      }
      
    } catch (error) {
      logger.error(`Erro ao atualizar grupo de produção ${grupoRef.id}:`, error);
    }
  }
}

// Função para verificar se grupo está completamente atendido
function verificarGrupoCompletamenteAtendido(grupo: GrupoMontagem): boolean {
  // Verificar peças necessárias
  if (grupo.pecasNecessarias && grupo.pecasNecessarias.length > 0) {
    const todasPecasAtendidas = grupo.pecasNecessarias.every(peca => {
      const totalAtendido = peca.atendimentoDetalhado?.reduce(
        (sum, item) => sum + item.quantidade, 0
      ) || 0;
      return totalAtendido >= peca.quantidade;
    });
    if (!todasPecasAtendidas) return false;
  }
  
  // Verificar modelos necessários
  if (grupo.modelosNecessarios && grupo.modelosNecessarios.length > 0) {
    const todosModelosAtendidos = grupo.modelosNecessarios.every(modelo => {
      const totalAtendido = modelo.atendimentoDetalhado?.reduce(
        (sum, item) => sum + item.quantidade, 0
      ) || 0;
      return totalAtendido >= modelo.quantidade;
    });
    if (!todosModelosAtendidos) return false;
  }
  
  // Verificar produtos finais necessários
  if (grupo.produtosFinaisNecessarios && grupo.produtosFinaisNecessarios.length > 0) {
    const todosProdutosAtendidos = grupo.produtosFinaisNecessarios.every(produto => {
      const totalAtendido = produto.atendimentoDetalhado?.reduce(
        (sum, item) => sum + item.quantidade, 0
      ) || 0;
      return totalAtendido >= produto.quantidade;
    });
    if (!todosProdutosAtendidos) return false;
  }
  
  return true;
}

// Função para processar payload antigo (compatibilidade)
async function processarPayloadAntigo(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  pedidoId: string,
  produtosConsumidos: UsoEstoquePayload['produtosConsumidos']
) {
  logger.info('Processando payload antigo (modo compatibilidade)');
  
  for (const produtoConsumido of produtosConsumidos) {
    const { produtoId, produtoTipo, quantidade } = produtoConsumido;
    
    // Buscar grupos de montagem deste pedido
    const gruposQuery = db.collection('gruposMontagem')
      .where('pedidoId', '==', pedidoId);

    const gruposSnapshot = await transaction.get(gruposQuery);

    if (gruposSnapshot.empty) {
      logger.warn(`Nenhum grupo de montagem encontrado para pedido ${pedidoId}`);
      continue;
    }

    for (const grupoDoc of gruposSnapshot.docs) {
      const grupo = grupoDoc.data() as GrupoMontagem;
      
      // Verificar se este grupo corresponde ao produto
      const correspondeAoProduto = 
        grupo.targetProductId === produtoId && 
        grupo.targetProductType === produtoTipo;
      
      // Verificar também pelo assemblyInstanceId
      const assemblyCorresponde = grupo.assemblyInstanceId?.includes(`-${produtoId}-`);
      
      if (!correspondeAoProduto && !assemblyCorresponde) {
        continue;
      }
      
      logger.info(`Atualizando grupo de montagem ${grupoDoc.id} para produto ${produtoId} (modo compatibilidade)`);
      
      // Atualizar atendimento detalhado - usar Timestamp.now() em vez de FieldValue.serverTimestamp()
      const timestamp = admin.firestore.Timestamp.now();
      let origem: any;
      
      if (produtoTipo === 'peca') {
        origem = 'estoque_peca' as const;
      } else if (produtoTipo === 'modelo') {
        origem = 'estoque_modelo' as const;
      } else {
        origem = 'estoque_kit' as const;
      }
      
      const updatedGrupo: Partial<GrupoMontagem> = { ...grupo };
      
      if (produtoTipo === 'peca' && grupo.pecasNecessarias) {
        const updatedPecasNecessarias = grupo.pecasNecessarias.map(peca => {
          if (peca.pecaId === produtoId) {
            const novoAtendimento = {
              origem: origem,
              quantidade: quantidade,
              timestamp: timestamp
            };
            peca.atendimentoDetalhado = [...(peca.atendimentoDetalhado || []), novoAtendimento];
          }
          return peca;
        });
        updatedGrupo.pecasNecessarias = updatedPecasNecessarias;
      }
      else if (produtoTipo === 'modelo' && grupo.modelosNecessarios) {
        const updatedModelosNecessarios = grupo.modelosNecessarios.map(modelo => {
          if (modelo.modeloId === produtoId) {
            const novoAtendimento = {
              origem: origem,
              quantidade: quantidade,
              timestamp: timestamp
            };
            modelo.atendimentoDetalhado = [...(modelo.atendimentoDetalhado || []), novoAtendimento];
          }
          return modelo;
        });
        updatedGrupo.modelosNecessarios = updatedModelosNecessarios;
      }
      else if (produtoTipo === 'kit' && grupo.produtosFinaisNecessarios) {
        const updatedProdutosFinais = grupo.produtosFinaisNecessarios.map(produto => {
          if (produto.produtoId === produtoId && produto.tipo === produtoTipo) {
            const novoAtendimento = {
              origem: origem,
              quantidade: quantidade,
              timestamp: timestamp
            };
            produto.atendimentoDetalhado = [...(produto.atendimentoDetalhado || []), novoAtendimento];
            produto.quantidadeAtendida = (produto.quantidadeAtendida || 0) + quantidade;
          }
          return produto;
        });
        updatedGrupo.produtosFinaisNecessarios = updatedProdutosFinais;
      }
      
      // Verificar se o grupo está completamente atendido
      const grupoCompletamenteAtendido = verificarGrupoCompletamenteAtendido(updatedGrupo as GrupoMontagem);
      if (grupoCompletamenteAtendido) {
        updatedGrupo.status = 'pronto_para_montagem';
      }

      transaction.update(grupoDoc.ref, updatedGrupo);
    }
  }
}

// Função principal para lidar com uso de estoque otimizado
export const handleUsoEstoqueOtimizado = async (
  snapshot: QueryDocumentSnapshot
) => {
  const db = admin.firestore();
  const lancamento = snapshot.data() as LancamentoProducao;

  if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.USO_ESTOQUE) {
    return null;
  }

  const payload = lancamento.payload as UsoEstoquePayload;
  const { 
    pedidoId, 
    produtosConsumidos, 
    posicoesConsumidas,
    gruposMontagemAfetados,
    gruposProducaoAfetados
  } = payload;

  logger.info(
    `Processando uso_estoque otimizado para pedido: ${pedidoId}`
  );

  try {
    await db.runTransaction(async (transaction) => {
      // FASE 1: COLETAR TODAS AS LEITURAS
      logger.info('FASE 1: Coletando todas as leituras');
      
      // 1.1. Ler pedido
      const pedidoRef = db.collection('pedidos').doc(pedidoId);
      const pedidoSnapshot = await transaction.get(pedidoRef);

      if (!pedidoSnapshot.exists) {
        logger.warn(`Pedido ${pedidoId} não encontrado.`);
        return;
      }

      // 1.2. Coletar referências para leitura (abordagem otimizada)
      let gruposMontagemParaAtualizar: Array<{
        grupoRef: admin.firestore.DocumentReference;
        grupoDoc: admin.firestore.DocumentSnapshot;
        modificacoes: any[];
      }> = [];

      let gruposProducaoParaAtualizar: Array<{
        grupoRef: admin.firestore.DocumentReference;
        grupoDoc: admin.firestore.DocumentSnapshot;
        modificacoes: any;
      }> = [];

      if (gruposMontagemAfetados || gruposProducaoAfetados) {
        logger.info('Usando abordagem otimizada com grupos mapeados');
        
        // Coletar grupos de montagem para leitura
        if (gruposMontagemAfetados) {
          const gruposMontagemRefs = await coletarGruposMontagemParaLeitura(db, gruposMontagemAfetados);
          for (const { grupoRef } of gruposMontagemRefs) {
            const grupoDoc = await transaction.get(grupoRef);
            gruposMontagemParaAtualizar.push({
              grupoRef,
              grupoDoc,
              modificacoes: gruposMontagemAfetados.find(g => g.grupoMontagemId === grupoRef.id)?.modificacoes || []
            });
          }
        }
        
        // Coletar grupos de produção para leitura
        if (gruposProducaoAfetados) {
          const gruposProducaoRefs = await coletarGruposProducaoParaLeitura(db, gruposProducaoAfetados);
          for (const { grupoRef, modificacoes } of gruposProducaoRefs) {
            const grupoDoc = await transaction.get(grupoRef);
            gruposProducaoParaAtualizar.push({
              grupoRef,
              grupoDoc,
              modificacoes
            });
          }
        }
      } else {
        // Modo compatibilidade: processar payload antigo
        logger.info('Usando modo compatibilidade (payload antigo)');
        await processarPayloadAntigo(
          transaction,
          db,
          pedidoId,
          produtosConsumidos
        );
      }

      // FASE 2: PROCESSAR LÓGICA (sem operações de banco)
      logger.info('FASE 2: Processando lógica (sem operações de banco)');
      // Nesta fase, todas as leituras já foram feitas, podemos processar a lógica
      // mas não fazemos mais operações de leitura/escrita no banco

      // FASE 3: APLICAR TODAS AS ESCRITAS
      logger.info('FASE 3: Aplicando todas as escritas');
      
      // 3.1. Aplicar modificações em grupos de montagem
      if (gruposMontagemParaAtualizar.length > 0) {
        await aplicarModificacoesGruposMontagem(transaction, gruposMontagemParaAtualizar);
      }
      
      // 3.2. Aplicar modificações em grupos de produção
      if (gruposProducaoParaAtualizar.length > 0) {
        await aplicarModificacoesGruposProducao(
          transaction,
          db,
          gruposProducaoParaAtualizar,
          pedidoId,
          gruposProducaoAfetados
        );
      }

      // 3.3. Criar lançamentos de saída de estoque
      await criarLancamentosSaidaEstoque(
        transaction,
        db,
        posicoesConsumidas,
        lancamento.usuarioId,
        pedidoId
      );

      // 3.4. Atualizar status do lançamento
      transaction.update(snapshot.ref, {
        status: 'processado',
        processadoEm: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info(`Uso de estoque otimizado processado com sucesso para pedido: ${pedidoId}`);
    });

  } catch (error) {
    logger.error(
      `Erro ao processar uso_estoque otimizado para lancamentoId: ${snapshot.id}`,
      error
    );
    throw error;
  }

  return null;
};

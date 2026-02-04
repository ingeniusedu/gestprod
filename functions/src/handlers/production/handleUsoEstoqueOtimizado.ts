import * as admin from 'firebase-admin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  LancamentoProducao,
  UsoEstoquePayload,
  LancamentoProducaoTipoEvento,
  GrupoProducaoOtimizado,
  GrupoMontagem,
  LancamentoProduto,
  ProdutoFinalNecessario
} from '../../types/productionTypes';
import { logger } from 'firebase-functions';

// Função para criar lançamentos de saída de estoque (CORRIGIDA: sem leituras na transação)
function criarLancamentosSaidaEstoque(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  posicoesConsumidas: UsoEstoquePayload['posicoesConsumidas'],
  usuarioId: string,
  pedidoId: string,
  produtosMap: Map<string, any> // Mapa pré-carregado com todos os produtos
) {
  for (const posicao of posicoesConsumidas) {
    const { produtoId, produtoTipo, localId, recipienteId, quantidade } = posicao;
    
    // Buscar do mapa pré-carregado (sem leitura na transação)
    const produtoKey = `${produtoTipo}_${produtoId}`;
    const produtoData = produtosMap.get(produtoKey);
    
    if (!produtoData) {
      throw new Error(`Produto ${produtoId} (${produtoTipo}) não encontrado no mapa pré-carregado`);
    }
    
    const posicoesEstoque = produtoData.posicoesEstoque || [];
    const posicaoExistente = posicoesEstoque.find((pos: any) => 
      pos.localId === localId && pos.recipienteId === recipienteId
    );
    
    if (!posicaoExistente) {
      throw new Error(`Posição de estoque não encontrada: localId=${localId}, recipienteId=${recipienteId}`);
    }
    
    // Criar objeto local com todos os campos necessários incluindo a divisão
    const localObj: any = {
      localId: localId,
      recipienteId: recipienteId,
      quantidade: quantidade,
      divisao: posicaoExistente.divisao // ✅ Incluir divisão da posição existente
    };
    
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
      locais: [localObj]
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

// Função para pré-carregar todos os produtos necessários (FASE 0)
async function carregarProdutosParaLancamentos(
  db: admin.firestore.Firestore,
  posicoesConsumidas: UsoEstoquePayload['posicoesConsumidas']
): Promise<Map<string, any>> {
  const produtosMap = new Map<string, any>();
  
  // Coletar produtos únicos necessários
  const produtosUnicos = new Set<string>();
  for (const posicao of posicoesConsumidas) {
    const { produtoId, produtoTipo } = posicao;
    produtosUnicos.add(`${produtoTipo}_${produtoId}`);
  }
  
  logger.info(`Carregando ${produtosUnicos.size} produtos únicos para lançamentos`);
  
  // Buscar todos os produtos de uma vez (fora da transação)
  for (const produtoKey of produtosUnicos) {
    const [produtoTipo, produtoId] = produtoKey.split('_', 2);
    const produtoRef = db.collection(`${produtoTipo}s`).doc(produtoId);
    const produtoDoc = await produtoRef.get();
    
    if (produtoDoc.exists) {
      produtosMap.set(produtoKey, produtoDoc.data());
    } else {
      throw new Error(`Produto ${produtoId} (${produtoTipo}) não encontrado`);
    }
  }
  
  logger.info(`Pré-carregamento concluído: ${produtosMap.size} produtos carregados`);
  return produtosMap;
}

// Função para buscar grupo de embalagem fora da transação
async function buscarGrupoEmbalagemForaTransacao(
  db: admin.firestore.Firestore,
  pedidoId: string
): Promise<admin.firestore.QueryDocumentSnapshot | null> {
  const grupoEmbalagemSnapshot = await db.collection('gruposMontagem')
    .where('pedidoId', '==', pedidoId)
    .where('targetProductType', '==', 'produto_final')
    .limit(1)
    .get();

  if (grupoEmbalagemSnapshot.empty) {
    return null;
  }

  return grupoEmbalagemSnapshot.docs[0];
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
              const updatedModelos = grupo.modelosNecessarios.map((modelo: any) => {
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
      
      //3. CALCULAR PROPORÇÃO BASEADA EM ASSEMBLYINSTANCES
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
          
          // Atualizar filamentosNecessarios e outrosInsumosNecessários proporcionalmente
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


// Função para extrair assemblyInstanceId do produto consumido baseado na hierarquia
function extrairAssemblyInstanceIdDoProdutoConsumido(
  produtoConsumido: UsoEstoquePayload['produtosConsumidos'][0],
  produtoRaiz: UsoEstoquePayload['produtoRaiz']
): string | null {
  const { produtoId, nivel } = produtoConsumido;
  const { id: raizId } = produtoRaiz;
  
  // Baseado no nível, construir o assemblyInstanceId
  if (nivel === 3) {
    // Kit raiz: "pedidoId-kitId-1"
    return `${raizId.split('-')[0]}-${raizId}-1`;
  } else if (nivel === 5) {
    // Modelo em kit: "pedidoId-kitId-1-modeloId-1"
    return `${raizId.split('-')[0]}-${raizId}-1-${produtoId}-1`;
  } else if (nivel === 7) {
    // Peça em modelo: "pedidoId-kitId-1-modeloId-1-pecaId-1"
    // Precisamos encontrar o modelo pai (nível 5)
    return `${raizId.split('-')[0]}-${raizId}-1-${extractModeloIdFromPecaAssembly(produtoId)}-${produtoId}-1`;
  }
  
  return null;
}

// Função auxiliar para extrair ID do modelo do assemblyInstanceId da peça
function extractModeloIdFromPecaAssembly(pecaId: string): string {
  // Esta é uma simplificação - na prática precisaríamos do contexto completo
  // Para o exemplo, vamos assumir que o modeloId pode ser inferido
  // ou que temos acesso à estrutura completa
  return pecaId; // Placeholder - precisa ser implementado corretamente
}

// Função para conciliar kit raiz (nível 3) - VERSÃO FLEXÍVEL
function conciliarKitRaiz(
  produtosFinais: ProdutoFinalNecessario[],
  produtoConsumido: UsoEstoquePayload['produtosConsumidos'][0]
): ProdutoFinalNecessario[] {
  return produtosFinais.map((produto: ProdutoFinalNecessario) => {
    if (produto.produtoId === produtoConsumido.produtoId && produto.tipo === 'kit') {
      const origem = `estoque_${produtoConsumido.produtoTipo}` as any;
      const timestamp = admin.firestore.Timestamp.now();
      
      const atendimentoExistente = produto.atendimentoDetalhado?.find((a: any) => a.origem === origem);
      const quantidadeAtual = atendimentoExistente?.quantidade || 0;
      
      logger.info(`Conciliando kit raiz ${produto.produtoId}: ${quantidadeAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtual + produtoConsumido.quantidade}`);
      
      // Criar produto atualizado base
      const produtoAtualizado = {
        ...produto,
        quantidadeAtendida: (produto.quantidadeAtendida || 0) + produtoConsumido.quantidade,
        atendimentoDetalhado: [
          ...(produto.atendimentoDetalhado || []),
          {
            origem,
            quantidade: produtoConsumido.quantidade,
            timestamp
          }
        ]
      };

      // ✅ ATUALIZAR 1: Peças diretas do kit (nível 1)
      if (produto.pecas) {
        const pecasAtualizadas = produto.pecas.map((peca: any) => {
          const quantidadeAtendidaAtual = peca.quantidadeAtendida || 0;
          logger.info(`  Atendendo peça direta do kit ${peca.pecaId}: ${quantidadeAtendidaAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtendidaAtual + produtoConsumido.quantidade}`);
          
          return {
            ...peca,
            quantidadeAtendida: quantidadeAtendidaAtual + produtoConsumido.quantidade
          };
        });
        
        produtoAtualizado.pecas = pecasAtualizadas;
        logger.info(`  Peças diretas do kit atualizadas: ${pecasAtualizadas.length} peças atendidas`);
      }

      // ✅ ATUALIZAR 2: Modelos do kit (nível intermediário) - FLEXÍVEL para 0, 1 ou N modelos
      if (produto.modelos && produto.modelos.length > 0) {
        logger.info(`  Processando ${produto.modelos.length} modelo(s) do kit ${produto.produtoId}`);
        
        const modelosAtualizados = produto.modelos.map((modelo: any) => {
          // Atender o modelo
          const quantidadeAtendidaModeloAtual = modelo.quantidadeAtendida || 0;
          logger.info(`    Atendendo modelo ${modelo.modeloId}: ${quantidadeAtendidaModeloAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtendidaModeloAtual + produtoConsumido.quantidade}`);
          
          const modeloAtualizado = {
            ...modelo,
            quantidadeAtendida: quantidadeAtendidaModeloAtual + produtoConsumido.quantidade
          };
          
          // ✅ ATUALIZAR 3: Peças dos modelos do kit (nível filho)
          if (modelo.pecas && modelo.pecas.length > 0) {
            const pecasDoModeloAtualizadas = modelo.pecas.map((peca: any) => {
              const quantidadeAtendidaPecaAtual = peca.quantidadeAtendida || 0;
              logger.info(`      Atendendo peça ${peca.pecaId} do modelo ${modelo.modeloId}: ${quantidadeAtendidaPecaAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtendidaPecaAtual + produtoConsumido.quantidade}`);
              
              return {
                ...peca,
                quantidadeAtendida: quantidadeAtendidaPecaAtual + produtoConsumido.quantidade
              };
            });
            
            modeloAtualizado.pecas = pecasDoModeloAtualizadas;
            logger.info(`      Peças do modelo ${modelo.modeloId} atualizadas: ${pecasDoModeloAtualizadas.length} peças atendidas`);
          } else {
            logger.info(`      Modelo ${modelo.modeloId} não tem peças aninhadas`);
          }
          
          return modeloAtualizado;
        });
        
        produtoAtualizado.modelos = modelosAtualizados;
        logger.info(`  Modelos do kit atualizados: ${modelosAtualizados.length} modelos atendidos`);
      } else {
        logger.info(`  Kit ${produto.produtoId} não tem modelos aninhados`);
      }

      return produtoAtualizado;
    }
    return produto;
  });
}


// Função para conciliar peça em modelo (nível 7)
function conciliarPecaEmModelo(
  produtosFinais: ProdutoFinalNecessario[],
  produtoConsumido: UsoEstoquePayload['produtosConsumidos'][0]
): ProdutoFinalNecessario[] {
  return produtosFinais.map(produto => {
    if (produto.tipo === 'kit' && produto.modelos) {
      const modelosAtualizados = produto.modelos.map((modelo: any) => {
        if (modelo.pecas) {
          const pecasAtualizadas = modelo.pecas.map((peca: any) => {
            if (peca.pecaId === produtoConsumido.produtoId) {
              logger.info(`Conciliando peça ${peca.pecaId} em modelo: ${peca.quantidadeAtendida || 0} + ${produtoConsumido.quantidade} = ${(peca.quantidadeAtendida || 0) + produtoConsumido.quantidade}`);
              
              // PackagingPeca não tem atendimentoDetalhado, apenas quantidadeAtendida
              return {
                ...peca,
                quantidadeAtendida: (peca.quantidadeAtendida || 0) + produtoConsumido.quantidade
              };
            }
            return peca;
          });
          
          return { ...modelo, pecas: pecasAtualizadas };
        }
        return modelo;
      });
      
      return { ...produto, modelos: modelosAtualizados };
    }
    return produto;
  });
}

// Função para conciliar modelo raiz (nível 3)
function conciliarModeloRaiz(
  produtosFinais: ProdutoFinalNecessario[],
  produtoConsumido: UsoEstoquePayload['produtosConsumidos'][0]
): ProdutoFinalNecessario[] {
  return produtosFinais.map((produto: ProdutoFinalNecessario) => {
    if (produto.produtoId === produtoConsumido.produtoId && produto.tipo === 'modelo') {
      const origem = `estoque_${produtoConsumido.produtoTipo}` as any;
      const timestamp = admin.firestore.Timestamp.now();
      
      const atendimentoExistente = produto.atendimentoDetalhado?.find((a: any) => a.origem === origem);
      const quantidadeAtual = atendimentoExistente?.quantidade || 0;
      
      logger.info(`Conciliando modelo raiz ${produto.produtoId}: ${quantidadeAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtual + produtoConsumido.quantidade}`);
      
      // Criar produto atualizado base
      const produtoAtualizado = {
        ...produto,
        quantidadeAtendida: (produto.quantidadeAtendida || 0) + produtoConsumido.quantidade,
        atendimentoDetalhado: [
          ...(produto.atendimentoDetalhado || []),
          {
            origem,
            quantidade: produtoConsumido.quantidade,
            timestamp
          }
        ]
      };

      // ✅ NOVO: Atender peças do modelo (nível 1)
      if (produto.pecas) {
        const pecasAtualizadas = produto.pecas.map((peca: any) => {
          const quantidadeAtendidaAtual = peca.quantidadeAtendida || 0;
          logger.info(`  Atendendo peça do modelo ${peca.pecaId}: ${quantidadeAtendidaAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtendidaAtual + produtoConsumido.quantidade}`);
          
          return {
            ...peca,
            quantidadeAtendida: quantidadeAtendidaAtual + produtoConsumido.quantidade
          };
        });
        
        produtoAtualizado.pecas = pecasAtualizadas;
        logger.info(`  Peças do modelo atualizadas: ${pecasAtualizadas.length} peças atendidas`);
      }

      return produtoAtualizado;
    }
    return produto;
  });
}

// Função para conciliar peça raiz (nível 3)
function conciliarPecaRaiz(
  produtosFinais: ProdutoFinalNecessario[],
  produtoConsumido: UsoEstoquePayload['produtosConsumidos'][0]
): ProdutoFinalNecessario[] {
  return produtosFinais.map((produto: ProdutoFinalNecessario) => {
    if (produto.produtoId === produtoConsumido.produtoId && produto.tipo === 'peca') {
      const origem = `estoque_${produtoConsumido.produtoTipo}` as any;
      const timestamp = admin.firestore.Timestamp.now();
      
      const atendimentoExistente = produto.atendimentoDetalhado?.find((a: any) => a.origem === origem);
      const quantidadeAtual = atendimentoExistente?.quantidade || 0;
      
      logger.info(`Conciliando peça raiz ${produto.produtoId}: ${quantidadeAtual} + ${produtoConsumido.quantidade} = ${quantidadeAtual + produtoConsumido.quantidade}`);
      
      return {
        ...produto,
        quantidadeAtendida: (produto.quantidadeAtendida || 0) + produtoConsumido.quantidade,
        atendimentoDetalhado: [
          ...(produto.atendimentoDetalhado || []),
          {
            origem,
            quantidade: produtoConsumido.quantidade,
            timestamp
          }
        ]
      };
    }
    return produto;
  });
}

// Função principal de conciliação no nível correto
function conciliarProdutoNoNivelCorreto(
  produtosFinais: ProdutoFinalNecessario[],
  produtoConsumido: UsoEstoquePayload['produtosConsumidos'][0],
  assemblyInstanceId: string,
  payload: UsoEstoquePayload // ✅ NOVO: Payload completo para acesso a nivelUsado e produtoRaiz
): ProdutoFinalNecessario[] {
  
  logger.info(`Conciliando produto ${produtoConsumido.produtoId} (nível ${produtoConsumido.nivel}) com assemblyInstanceId: ${assemblyInstanceId}`);
  
  // ✅ CORREÇÃO: Usar combinação de nivelUsado + produtoRaizTipo para determinar o tipo real
  const nivelUsado = payload.nivelUsado || produtoConsumido.nivel;
  const produtoRaizTipo = payload.produtoRaiz.tipo || produtoConsumido.produtoTipo;
  
  logger.info(`  -> Combinação detectada: nivelUsado=${nivelUsado}, produtoRaizTipo=${produtoRaizTipo}`);
  
  if (nivelUsado === 3) {
    if (produtoRaizTipo === 'kit') {
      // Nível 3 + Kit = Kit raiz
      logger.info(`  -> Detectado nível 3 (kit raiz)`);
      return conciliarKitRaiz(produtosFinais, produtoConsumido);
    } else if (produtoRaizTipo === 'modelo') {
      // Nível 3 + Modelo = Modelo raiz
      logger.info(`  -> Detectado nível 3 (modelo raiz)`);
      return conciliarModeloRaiz(produtosFinais, produtoConsumido);
    } else if (produtoRaizTipo === 'peca') {
      // Nível 3 + Peça = Peça raiz
      logger.info(`  -> Detectado nível 3 (peça raiz)`);
      return conciliarPecaRaiz(produtosFinais, produtoConsumido);
    }
  } else if (nivelUsado === 5 && produtoRaizTipo === 'peca') {
    // Nível 5 + Peça = Peça filha (dentro de modelo ou kit)
    logger.info(`  -> Detectado nível 5 (peça filha)`);
    return conciliarPecaEmModelo(produtosFinais, produtoConsumido); // Reaproveitar função existente
  }
  
  logger.warn(`  -> Combinação não reconhecida: nivelUsado=${nivelUsado}, produtoRaizTipo=${produtoRaizTipo}`);
  return produtosFinais;
}

// Função para verificar se todos os produtos foram atendidos
function verificarTodosProdutosAtendidos(produtosFinais: ProdutoFinalNecessario[]): boolean {
  return produtosFinais.every(produto => {
    const totalAtendido = produto.atendimentoDetalhado?.reduce(
      (sum: number, item: any) => sum + item.quantidade, 0
    ) || 0;
    const atendido = totalAtendido >= produto.quantidade;
    
    logger.info(`Verificação produto ${produto.produtoId}: necessário=${produto.quantidade}, atendido=${totalAtendido}, OK=${atendido}`);
    
        // Verificar também modelos e peças aninhadas
    if (produto.tipo === 'kit' && produto.modelos) {
      const modelosAtendidos = produto.modelos.every((modelo: any) => {
        // PackagingModelo não tem atendimentoDetalhado, apenas quantidadeAtendida
        const totalAtendidoModelo = modelo.quantidadeAtendida || 0;
        const modeloAtendido = totalAtendidoModelo >= modelo.quantidade;
        
        logger.info(`  Modelo ${modelo.modeloId}: necessário=${modelo.quantidade}, atendido=${totalAtendidoModelo}, OK=${modeloAtendido}`);
        
        // Verificar peças do modelo
        if (modelo.pecas) {
          const pecasAtendidas = modelo.pecas.every((peca: any) => {
            // PackagingPeca não tem atendimentoDetalhado, apenas quantidadeAtendida
            const totalAtendidoPeca = peca.quantidadeAtendida || 0;
            const pecaAtendida = totalAtendidoPeca >= peca.quantidade;
            
            logger.info(`    Peça ${peca.pecaId}: necessário=${peca.quantidade}, atendido=${totalAtendidoPeca}, OK=${pecaAtendida}`);
            return pecaAtendida;
          });
          return modeloAtendido && pecasAtendidas;
        }
        
        return modeloAtendido;
      });
      return atendido && modelosAtendidos;
    }
    
    return atendido;
  });
}

// Função reescrita para atualizar grupo de embalagem (produto_final)
async function atualizarGrupoEmbalagem(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  pedidoId: string,
  produtosConsumidos: UsoEstoquePayload['produtosConsumidos'],
  gruposMontagemAfetados: UsoEstoquePayload['gruposMontagemAfetados'],
  produtoRaiz: UsoEstoquePayload['produtoRaiz'],
  grupoEmbalagemDoc?: admin.firestore.QueryDocumentSnapshot,
  payload?: UsoEstoquePayload // ✅ NOVO: Adicionar parâmetro payload
) {
  logger.info(`Atualizando grupo de embalagem para pedido: ${pedidoId}`);
  logger.info(`Produto raiz: ${produtoRaiz.tipo} ${produtoRaiz.id} (quantidade: ${produtoRaiz.quantidade})`);
  logger.info(`Produtos consumidos: ${produtosConsumidos.length}`);
  logger.info(`Grupos montagem afetados: ${gruposMontagemAfetados?.length || 0}`);
  
  // 1. Validar grupo de embalagem
  if (!grupoEmbalagemDoc) {
    logger.warn(`Grupo de embalagem não encontrado para pedido: ${pedidoId}`);
    return;
  }

  const grupoEmbalagem = grupoEmbalagemDoc.data() as GrupoMontagem;
  let produtosFinais = [...(grupoEmbalagem.produtosFinaisNecessarios || [])];

  logger.info(`Grupo de embalagem encontrado: ${grupoEmbalagemDoc.id}`);
  logger.info(`Produtos finais necessários: ${produtosFinais.length}`);

  // 2. Criar mapa de assemblyInstanceId para grupos de montagem
  interface GrupoMontagemAfetado {
    grupoMontagemId: string;
    assemblyInstanceId: string;
    modificacoes: { campo: string; valor: any }[];
  }
  
  const montagemPorAssemblyInstance = new Map<string, GrupoMontagemAfetado>();
  gruposMontagemAfetados?.forEach(montagem => {
    montagemPorAssemblyInstance.set(montagem.assemblyInstanceId, montagem);
    logger.info(`Mapeando assemblyInstance ${montagem.assemblyInstanceId} -> grupo ${montagem.grupoMontagemId}`);
  });

  // 3. Processar cada produto consumido com conciliação multi-nível
  for (const produtoConsumido of produtosConsumidos) {
    logger.info(`\n=== Processando produto consumido: ${produtoConsumido.produtoTipo} ${produtoConsumido.produtoId} (nível ${produtoConsumido.nivel}) ===`);
    
    // 3.1. Extrair assemblyInstanceId do produto consumido
    const assemblyInstanceId = extrairAssemblyInstanceIdDoProdutoConsumido(produtoConsumido, produtoRaiz);
    
    if (!assemblyInstanceId) {
      logger.warn(`AssemblyInstanceId não pode ser extraído para produto: ${produtoConsumido.produtoId}`);
      continue;
    }
    
    logger.info(`AssemblyInstanceId calculado: ${assemblyInstanceId}`);
    
    // 3.2. Verificar se temos um grupo de montagem correspondente
    const grupoMontagemAfetado = montagemPorAssemblyInstance.get(assemblyInstanceId);
    if (grupoMontagemAfetado) {
      logger.info(`Grupo de montagem correspondente encontrado: ${grupoMontagemAfetado.grupoMontagemId}`);
      
      // Validar se o grupo afetado corresponde ao produto consumido
      const modificacao = grupoMontagemAfetado.modificacoes.find((m: any) => m.campo === 'atendimentoDetalhado');
      if (modificacao) {
        const { produtoRaizId, produtoRaizTipo, quantidade } = modificacao.valor;
        logger.info(`Modificação encontrada: produtoRaiz=${produtoRaizId}/${produtoRaizTipo}, quantidade=${quantidade}`);
      }
    } else {
      logger.warn(`Nenhum grupo de montagem encontrado para assemblyInstanceId: ${assemblyInstanceId}`);
    }
    
    // 3.3. Conciliar no nível correto baseado no assemblyInstanceId
    produtosFinais = conciliarProdutoNoNivelCorreto(
      produtosFinais,
      produtoConsumido,
      assemblyInstanceId,
      payload!
    );
  }

  // 4. Validar consistência hierárquica
  logger.info(`\n=== Validando consistência hierárquica ===`);
  const todosAtendidos = verificarTodosProdutosAtendidos(produtosFinais);
  
  // 5. Preparar atualização do grupo
  const updatedGrupo: Partial<GrupoMontagem> = {
    ...grupoEmbalagem,
    produtosFinaisNecessarios: produtosFinais,
    status: todosAtendidos ? 'produzido_aguardando_embalagem' : 'em_montagem'
  };

  // 6. Atualizar grupo no banco
  transaction.update(grupoEmbalagemDoc.ref, updatedGrupo);
  
  logger.info(`\n=== Grupo de embalagem ${grupoEmbalagemDoc.id} atualizado ===`);
  logger.info(`Status: ${updatedGrupo.status}`);
  logger.info(`Produtos finais atualizados: ${produtosFinais.length}`);
  logger.info(`Todos atendidos: ${todosAtendidos}`);
}

// Função para processar payload antigo (compatibilidade) - SIMPLIFICADA
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
      
      const updatedGrupo: Partial<GrupoMontagem> = { ...grupo };
      
      if (produtoTipo === 'peca' && grupo.pecasNecessarias) {
        const updatedPecasNecessarias = grupo.pecasNecessarias.map(peca => {
          if (peca.pecaId === produtoId) {
            const novoAtendimento = {
              origem: 'estoque_peca' as const,
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
              origem: 'estoque_modelo' as const,
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
              origem: 'estoque_kit' as const,
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
    `Processando uso_estoque otimizado v2.2 (corrigido transaction) para pedido: ${pedidoId}`
  );

  try {
    // FASE 0: PRÉ-CARREGAR PRODUTOS FORA DA TRANSAÇÃO
    logger.info('FASE 0: Pré-carregando produtos para lançamentos');
    const produtosMap = await carregarProdutosParaLancamentos(db, posicoesConsumidas);

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
        logger.info('Usando modo compatibilidade');
        
        // Buscar todos os grupos de montagem do pedido
        const gruposQuery = db.collection('gruposMontagem')
          .where('pedidoId', '==', pedidoId);

        const gruposSnapshot = await transaction.get(gruposQuery);

        if (!gruposSnapshot.empty) {
          // Processar payload antigo (simplificado)
          await processarPayloadAntigo(transaction, db, pedidoId, produtosConsumidos);
        }
      }

      // FASE 2: PROCESSAR LÓGICA (sem operações de banco)
      logger.info('FASE 2: Processando lógica (sem operações de banco)');

      // FASE 3: APLICAR TODAS AS ESCRITAS
      logger.info('FASE 3: Aplicando todas as escritas');
      
      // 3.1. Aplicar modificações em grupos de montagem (modo otimizado)
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

      // 3.3. Criar lançamentos de saída de estoque (CORRIGIDO: usando mapa pré-carregado)
      await criarLancamentosSaidaEstoque(
        transaction,
        db,
        posicoesConsumidas,
        lancamento.usuarioId,
        pedidoId,
        produtosMap // ✅ Novo parâmetro: mapa pré-carregado
      );

      // 3.4. Atualizar grupo de embalagem (produto_final)
      // Buscar grupo de embalagem fora da transação
      const grupoEmbalagemDoc = await buscarGrupoEmbalagemForaTransacao(db, pedidoId);
      if (grupoEmbalagemDoc) {
        await atualizarGrupoEmbalagem(
          transaction,
          db,
          pedidoId,
          produtosConsumidos,
          gruposMontagemAfetados,
          payload.produtoRaiz,
          grupoEmbalagemDoc,
          payload
        );
      }

      //3.5. Atualizar status do lançamento
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

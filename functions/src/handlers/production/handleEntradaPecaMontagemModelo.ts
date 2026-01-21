import * as admin from 'firebase-admin';
import {
  LancamentoProducao,
  EntradaPecaMontagemPayload,
  GrupoMontagem,
  LancamentoProducaoTipoEvento,
} from '../../types/productionTypes';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export const handleEntradaPecaMontagemModelo = async (
  snapshot: QueryDocumentSnapshot
) => {
  const db = admin.firestore();
  const lancamento = snapshot.data() as LancamentoProducao;

  if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ENTRADA_PECA_MONTAGEM_MODELO) {
    return null;
  }

  const payload = lancamento.payload as EntradaPecaMontagemPayload;
  const { assemblyInstanceId, parentModeloId, pecaId, quantidade } = payload;

  logger.info(
    `Processando entrada_peca_montagem_modelo para assemblyInstanceId: ${assemblyInstanceId}, Modelo: ${parentModeloId}, Peça: ${pecaId}, Quantidade: ${quantidade}`
  );

  try {
    await db.runTransaction(async (transaction) => {
      // 1. Buscar grupo de montagem do modelo
      const grupoMontagemRef = db
        .collection('gruposMontagem')
        .where('assemblyInstanceId', '==', assemblyInstanceId)
        .where('targetProductId', '==', parentModeloId)
        .limit(1);

      const grupoMontagemSnapshot = await transaction.get(grupoMontagemRef);

      if (grupoMontagemSnapshot.empty) {
        logger.warn(
          `GrupoMontagem para Modelo ${parentModeloId} com assemblyInstanceId ${assemblyInstanceId} não encontrado.`
        );
        return;
      }

      const grupoMontagemDoc = grupoMontagemSnapshot.docs[0];
      const grupoMontagem = grupoMontagemDoc.data() as GrupoMontagem;

      // 2. Buscar grupo de embalagem antecipadamente
      const pedidoId = assemblyInstanceId.split('-')[0];
      let grupoMontagemEmbalagemDoc = null;
      let grupoMontagemEmbalagem = null;

      if (pedidoId) {
        const packagingAssemblyInstanceId = `${pedidoId}-embalagem-final`;
        
        const grupoMontagemEmbalagemQuery = await transaction.get(
          db.collection('gruposMontagem')
              .where('assemblyInstanceId', '==', packagingAssemblyInstanceId)
              .where('targetProductType', '==', 'produto_final')
              .limit(1)
        );

        if (!grupoMontagemEmbalagemQuery.empty) {
          grupoMontagemEmbalagemDoc = grupoMontagemEmbalagemQuery.docs[0];
          grupoMontagemEmbalagem = grupoMontagemEmbalagemDoc.data() as GrupoMontagem;
        }
      }

      if (!grupoMontagem.pecasNecessarias) {
        logger.warn(
          `GrupoMontagem para Modelo ${parentModeloId} com assemblyInstanceId ${assemblyInstanceId} não possui pecasNecessarias.`
        );
        return;
      }

      let allPecasAtendidas = true;
      const updatedPecasNecessarias = grupoMontagem.pecasNecessarias.map((pecaNecessaria) => {
        if (pecaNecessaria.pecaId === pecaId) {
          const existingMontagemPecaEntryIndex = (pecaNecessaria.atendimentoDetalhado || []).findIndex(
            (det) => det.origem === 'montagem_peca'
          );

          let updatedAtendimentoDetalhado = [...(pecaNecessaria.atendimentoDetalhado || [])];

          if (existingMontagemPecaEntryIndex > -1) {
            updatedAtendimentoDetalhado[existingMontagemPecaEntryIndex] = {
              ...updatedAtendimentoDetalhado[existingMontagemPecaEntryIndex],
              quantidade: (updatedAtendimentoDetalhado[existingMontagemPecaEntryIndex].quantidade || 0) + quantidade,
              timestamp: admin.firestore.Timestamp.now(),
            };
          } else {
            updatedAtendimentoDetalhado.push({
              origem: 'montagem_peca' as const,
              quantidade: quantidade,
              timestamp: admin.firestore.Timestamp.now(),
            });
          }

          const totalAtendido = updatedAtendimentoDetalhado.reduce((sum, item) => sum + item.quantidade, 0);

          if (totalAtendido < pecaNecessaria.quantidade) {
            allPecasAtendidas = false;
          }

          return {
            ...pecaNecessaria,
            atendimentoDetalhado: updatedAtendimentoDetalhado,
          };
        }
        if (
          (pecaNecessaria.atendimentoDetalhado?.reduce((sum, item) => sum + item.quantidade, 0) || 0) <
          pecaNecessaria.quantidade
        ) {
          allPecasAtendidas = false;
        }
        return pecaNecessaria;
      });

      const updatedGrupoMontagem: Partial<GrupoMontagem> = {
        pecasNecessarias: updatedPecasNecessarias,
      };

      if (allPecasAtendidas) {
        // updatedGrupoMontagem.status = 'pronto_para_montagem'; // Temporarily disabled as per user feedback
        logger.info(
          `Todas as peças para o Modelo ${parentModeloId} no assemblyInstanceId ${assemblyInstanceId} foram atendidas. Status de montagem não atualizado para 'pronto_para_montagem' temporariamente.`
        );

        // TODO: Gerar próximo evento (entrada_modelo_montagem_kit ou entrada_modelo_embalagem)
        // Isso dependerá se o modelo é parte de um kit ou um produto final.
        // Por enquanto, apenas atualizamos o status.
      }

      // 4. Atualizar grupo de embalagem com a peça concluída
      if (pedidoId && grupoMontagemEmbalagemDoc && grupoMontagemEmbalagem) {
        // Encontrar e atualizar a peça correspondente nos produtosFinaisNecessarios
        const updatedProdutosFinaisNecessarios = (grupoMontagemEmbalagem.produtosFinaisNecessarios || []).map((produto: any) => {
          // Caso 1: Modelos dentro de kits (estrutura aninhada)
          if (produto.modelos) {
            const updatedModelos = produto.modelos.map((modelo: any) => {
              if (modelo.modeloId === parentModeloId) {
                // Encontrar a peça dentro deste modelo
                const updatedPecas = (modelo.pecas || []).map((peca: any) => {
                  if (peca.pecaId === pecaId) {
                    const newQuantidadeAtendida = (peca.quantidadeAtendida || 0) + quantidade;
                    return {
                      ...peca,
                      quantidadeAtendida: newQuantidadeAtendida
                    };
                  }
                  return peca;
                });

                // NÃO atualizar quantidade atendida do modelo automaticamente
                // Isso deve ser feito apenas quando o usuário concluir a montagem do modelo
                return {
                  ...modelo,
                  pecas: updatedPecas
                  // quantidadeAtendida não é alterado aqui
                };
              }
              return modelo;
            });

            return {
              ...produto,
              modelos: updatedModelos
            };
          }
          
          // Caso 2: Modelo diretamente em produtosFinaisNecessarios (não aninhado em kit)
          if (produto.tipo === 'modelo' && produto.produtoId === parentModeloId) {
            // Encontrar e atualizar a peça dentro deste modelo
            const updatedPecas = (produto.pecas || []).map((peca: any) => {
              if (peca.pecaId === pecaId) {
                const newQuantidadeAtendida = (peca.quantidadeAtendida || 0) + quantidade;
                return {
                  ...peca,
                  quantidadeAtendida: newQuantidadeAtendida
                };
              }
              return peca;
            });

            // NÃO atualizar quantidade atendida do modelo automaticamente
            // Isso deve ser feito apenas quando o usuário concluir a montagem do modelo
            return {
              ...produto,
              pecas: updatedPecas
              // quantidadeAtendida não é alterado aqui
            };
          }
          
          return produto;
        });

        transaction.update(grupoMontagemEmbalagemDoc.ref, {
          produtosFinaisNecessarios: updatedProdutosFinaisNecessarios
        });
      }

      transaction.update(grupoMontagemDoc.ref, updatedGrupoMontagem);
    });

    logger.info(
      `Handler entrada_peca_montagem_modelo concluído para lancamentoId: ${snapshot.id}`
    );
  } catch (error) {
    logger.error(
      `Erro ao processar entrada_peca_montagem_modelo para lancamentoId: ${snapshot.id}`,
      error
    );
  }

  return null;
};

import * as admin from 'firebase-admin';
import { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  LancamentoProducao,
  EstoqueExcedentePayload,
  LancamentoProducaoTipoEvento,
  LancamentoProduto
} from '../../types/productionTypes';
import { logger } from 'firebase-functions';

export const handleEstoqueExcedente = async (
  snapshot: QueryDocumentSnapshot
) => {
  const db = admin.firestore();
  const lancamento = snapshot.data() as LancamentoProducao;

  if (lancamento.tipoEvento !== LancamentoProducaoTipoEvento.ESTOQUE_EXCEDENTE) {
    return null;
  }

  const payload = lancamento.payload as EstoqueExcedentePayload;
  const { produtoId, produtoTipo, quantidade, localId, recipienteId, divisao, observacao } = payload;

  logger.info(
    `Processando estoque_excedente para produto: ${produtoId} (${produtoTipo}), quantidade: ${quantidade}`
  );

  try {
    await db.runTransaction(async (transaction) => {
      // 1. Verificar se o produto existe
      const produtoRef = db.collection(`${produtoTipo}s`).doc(produtoId);
      const produtoSnapshot = await transaction.get(produtoRef);

      if (!produtoSnapshot.exists) {
        logger.warn(`Produto ${produtoId} (${produtoTipo}) não encontrado.`);
        return;
      }

      // 2. Criar lançamento de entrada de estoque
      const lancamentoProduto: LancamentoProduto = {
        id: '', // Será gerado pelo Firestore
        produtoId: produtoId,
        tipoProduto: produtoTipo,
        tipoMovimento: 'entrada',
        quantidade: quantidade,
        usuario: lancamento.usuarioId,
        observacao: observacao || `Excedente de produção lançado em estoque`,
        data: admin.firestore.FieldValue.serverTimestamp(),
        locais: [{
          recipienteId: recipienteId,
          localId: localId,
          divisao: divisao || null,
          quantidade: quantidade
        }]
      };

      // 3. Criar documento no Firestore
      const lancamentoRef = db.collection('lancamentosProdutos').doc();
      transaction.create(lancamentoRef, {
        ...lancamentoProduto,
        id: lancamentoRef.id
      });

      logger.info(`Lançamento de entrada criado para produto ${produtoId}: ${quantidade} unidades`);

      // 4. Atualizar status do lançamento de produção
      transaction.update(snapshot.ref, {
        status: 'processado',
        processadoEm: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info(`Estoque excedente processado com sucesso para produto: ${produtoId}`);
    });

  } catch (error) {
    logger.error(
      `Erro ao processar estoque_excedente para lancamentoId: ${snapshot.id}`,
      error
    );
    throw error;
  }

  return null;
};

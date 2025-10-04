import {onDocumentWritten, onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import { updateGrupoDeFilamentoUtil } from "./utils/grupoFilamentoUtils";
import { processLancamentoProdutoUtil } from "./utils/lancamentoProdutoUtils";
import { processLancamentoInsumoUtil } from "./utils/lancamentoInsumoUtils";
import { processarLancamentoServicoUtil } from "./utils/lancamentoServicoUtils";
import { handleCriacaoPedido } from "./handlers/production/handleCriacaoPedido";
import { handleInicioProducao } from "./handlers/production/handleInicioProducao";
import { handleConclusaoProducao } from "./handlers/production/handleConclusaoProducao";
import { handleEntradaParteMontagemPeca } from "./handlers/production/handleEntradaParteMontagemPeca";
import { handleConclusaoMontagemPeca } from "./handlers/production/handleConclusaoMontagemPeca";
import { handleEntradaPecaMontagemModelo } from "./handlers/production/handleEntradaPecaMontagemModelo"; // New import
import { handleConclusaoMontagemModelo } from "./handlers/production/handleConclusaoMontagemModelo"; // New import
import { handleEntradaPecaMontagemKit } from "./handlers/production/handleEntradaPecaMontagemKit"; // New import
import { handleEntradaModeloMontagemKit } from "./handlers/production/handleEntradaModeloMontagemKit"; // New import
import { handleEntradaPecaEmbalagem } from "./handlers/production/handleEntradaPecaEmbalagem"; // New import
import { handleEntradaModeloEmbalagem } from "./handlers/production/handleEntradaModeloEmbalagem"; // New import

admin.initializeApp(); // Initialize Firebase Admin SDK once at the top level

export const updateGrupoDeFilamento = onDocumentWritten("insumos/{insumoId}", async (event) => {
    await updateGrupoDeFilamentoUtil(event);
});

export const processLancamentoProduto = onDocumentCreated({
    document: "lancamentosProdutos/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    await processLancamentoProdutoUtil(event);
});

export const processLancamentoInsumo = onDocumentCreated({
    document: "lancamentosInsumos/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    await processLancamentoInsumoUtil(event);
});

export const processarLancamentoServico = onDocumentCreated({
    document: "lancamentosServicos/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    await processarLancamentoServicoUtil(event);
});

export const processLancamentoProducao = onDocumentCreated({
    document: "lancamentosProducao/{lancamentoId}",
    region: "us-central1",
}, async (event) => {
    const lancamento = event.data?.data();
    
    if (!lancamento) {
        console.error('Nenhum dado de lançamento de produção encontrado');
        return;
    }

    try {
        switch (lancamento.tipoEvento) {
            case 'criacao_pedido':
                return await handleCriacaoPedido(event);
            case 'inicio_producao':
                return await handleInicioProducao(event);
            case 'conclusao_producao':
                return await handleConclusaoProducao(event);
            case 'entrada_parte_montagem_peca':
                return await handleEntradaParteMontagemPeca(event.data as admin.firestore.QueryDocumentSnapshot);
            case 'conclusao_montagem_peca':
                return await handleConclusaoMontagemPeca(event);
            case 'entrada_peca_montagem_modelo': // New case
                return await handleEntradaPecaMontagemModelo(event.data as admin.firestore.QueryDocumentSnapshot);
            case 'conclusao_montagem_modelo': // New case
                return await handleConclusaoMontagemModelo(event);
            case 'entrada_peca_montagem_kit': // New case
                return await handleEntradaPecaMontagemKit(event);
            case 'entrada_modelo_montagem_kit': // New case
                return await handleEntradaModeloMontagemKit(event);
            case 'entrada_peca_embalagem': // New case
                return await handleEntradaPecaEmbalagem(event);
            case 'entrada_modelo_embalagem': // New case
                return await handleEntradaModeloEmbalagem(event);
            default:
                console.error(`Tipo de evento desconhecido: ${lancamento.tipoEvento}`);
                throw new Error(`Tipo de evento desconhecido: ${lancamento.tipoEvento}`);
        }
    } catch (error) {
        console.error('Erro no processamento do lançamento de produção:', error);
        throw error;
    }
});

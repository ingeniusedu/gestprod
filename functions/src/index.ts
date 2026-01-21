import {onDocumentWritten, onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {onMessagePublished} from "firebase-functions/v2/pubsub";
import * as admin from "firebase-admin";
import { PubSub } from "@google-cloud/pubsub";

import { updateGrupoDeFilamentoUtil } from "./utils/grupoFilamentoUtils";
import { processLancamentoProdutoUtil } from "./utils/lancamentoProdutoUtils";
import { processLancamentoInsumoUtil } from "./utils/lancamentoInsumoUtils";
import { processLancamentosServico } from "./utils/lancamentoServicoUtils";
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
import { handleEntradaModeloEmbalagem } from "./handlers/production/handleEntradaModeloEmbalagem"; // New import - re-evaluating import
import { handleEntradaKitEmbalagem } from "./handlers/production/handleEntradaKitEmbalagem"; // New import
import { handleConclusaoPedido } from "./handlers/production/handleConclusaoPedido"; // NEW: Centralized conclusion handler
import { handleUsoEstoqueOtimizado } from "./handlers/production/handleUsoEstoqueOtimizado"; // NEW: Uso de estoque handler otimizado
import { handleEstoqueExcedente } from "./handlers/production/handleEstoqueExcedente"; // NEW: Estoque excedente handler
// handleConclusaoMontagemKit import removed to use dynamic import due to TS resolution issues.
import { recalcularCustoProduto, recalcularTodasPecas, recalcularTodosModelos, recalcularTodosKits } from "./utils/calculoCustoUtils";

admin.initializeApp(); // Initialize Firebase Admin SDK once at the top level

// Inicializar cliente Pub/Sub
const pubsubClient = new PubSub();

export const updateGrupoDeFilamento = onDocumentWritten("insumos/{insumoId}", async (event) => {
    await updateGrupoDeFilamentoUtil(event);
});

// ========== TÓPICOS PUB/SUB PARA ATUALIZAÇÃO DE CUSTOS ==========
const TOPICO_ATUALIZAR_PECAS = "atualizacao-custo-pecas";
const TOPICO_ATUALIZAR_MODELOS = "atualizacao-custo-modelos";
const TOPICO_ATUALIZAR_KITS = "atualizacao-custo-kits";

// ========== FUNÇÕES PUB/SUB PARA ATUALIZAÇÃO EM CADEIA ==========

/**
 * Função 1: Atualiza todas as peças quando filamento/serviceCosts muda
 */
export const atualizarPecasPubSub = onMessagePublished(
  TOPICO_ATUALIZAR_PECAS,
  async (event) => {
    try {
      console.log("Iniciando atualização de todas as peças via Pub/Sub");
      
      // Recalcular TODAS as peças do zero
      await recalcularTodasPecas();
      
      console.log("Peças atualizadas. Publicando mensagem para atualizar modelos...");
      
      // Publicar mensagem para próxima etapa
      await pubsubClient.topic(TOPICO_ATUALIZAR_MODELOS).publishMessage({
        data: Buffer.from(JSON.stringify({ origem: "atualizacao-pecas" }))
      });
      
      console.log("Mensagem publicada para atualização de modelos");
    } catch (error) {
      console.error("Erro na atualização de peças via Pub/Sub:", error);
      throw error;
    }
  }
);

/**
 * Função 2: Atualiza todos os modelos após peças serem atualizadas
 */
export const atualizarModelosPubSub = onMessagePublished(
  TOPICO_ATUALIZAR_MODELOS,
  async (event) => {
    try {
      console.log("Iniciando atualização de todos os modelos via Pub/Sub");
      
      // Recalcular TODOS os modelos do zero
      await recalcularTodosModelos();
      
      console.log("Modelos atualizados. Publicando mensagem para atualizar kits...");
      
      // Publicar mensagem para próxima etapa
      await pubsubClient.topic(TOPICO_ATUALIZAR_KITS).publishMessage({
        data: Buffer.from(JSON.stringify({ origem: "atualizacao-modelos" }))
      });
      
      console.log("Mensagem publicada para atualização de kits");
    } catch (error) {
      console.error("Erro na atualização de modelos via Pub/Sub:", error);
      throw error;
    }
  }
);

/**
 * Função 3: Atualiza todos os kits após modelos serem atualizados
 */
export const atualizarKitsPubSub = onMessagePublished(
  TOPICO_ATUALIZAR_KITS,
  async (event) => {
    try {
      console.log("Iniciando atualização de todos os kits via Pub/Sub");
      
      // Recalcular TODOS os kits do zero
      await recalcularTodosKits();
      
      console.log("Kits atualizados. Cadeia de atualização concluída.");
    } catch (error) {
      console.error("Erro na atualização de kits via Pub/Sub:", error);
      throw error;
    }
  }
);

// ========== TRIGGERS ORIGINAIS MODIFICADOS ==========

/**
 * Trigger quando um grupo de filamento é atualizado (custo médio ponderado muda)
 */
export const onUpdateGrupoDeFilamento = onDocumentUpdated("gruposDeFilamento/{grupoId}", async (event) => {
  try {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    // Verificar se o custo médio ponderado mudou
    if (beforeData?.custoMedioPonderado !== afterData?.custoMedioPonderado) {
      const grupoId = event.params.grupoId;
      console.log(`Custo médio ponderado do filamento ${grupoId} mudou. Iniciando cadeia de atualização via Pub/Sub...`);
      
      // Publicar mensagem para iniciar a cadeia
      await pubsubClient.topic(TOPICO_ATUALIZAR_PECAS).publishMessage({
        data: Buffer.from(JSON.stringify({ 
          tipo: "filamento",
          grupoFilamentoId: grupoId,
          timestamp: new Date().toISOString()
        }))
      });
      
      console.log(`Mensagem publicada no tópico ${TOPICO_ATUALIZAR_PECAS}`);
    }
  } catch (error) {
    console.error("Erro no trigger onUpdateGrupoDeFilamento:", error);
    throw error;
  }
});

/**
 * Trigger quando um insumo é atualizado (custo por unidade muda)
 */
export const onUpdateInsumo = onDocumentUpdated("insumos/{insumoId}", async (event) => {
  try {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    // Verificar se o custo por unidade mudou
    if (beforeData?.custoPorUnidade !== afterData?.custoPorUnidade) {
      const insumoId = event.params.insumoId;
      console.log(`Custo do insumo ${insumoId} mudou. Iniciando cadeia de atualização via Pub/Sub...`);
      
      // Publicar mensagem para iniciar a cadeia
      await pubsubClient.topic(TOPICO_ATUALIZAR_PECAS).publishMessage({
        data: Buffer.from(JSON.stringify({ 
          tipo: "insumo",
          insumoId: insumoId,
          timestamp: new Date().toISOString()
        }))
      });
      
      console.log(`Mensagem publicada no tópico ${TOPICO_ATUALIZAR_PECAS}`);
    }
  } catch (error) {
    console.error("Erro no trigger onUpdateInsumo:", error);
    throw error;
  }
});

/**
 * Trigger quando configurações de custos de serviço mudam
 */
export const onUpdateServiceCosts = onDocumentUpdated("settings/serviceCosts", async (event) => {
  try {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    // Verificar se algum custo de serviço mudou
    const costFields = ['costPerMinute3DPrint', 'costPerMinuteAssembly', 'costPerMinutePackaging'];
    const hasChanges = costFields.some(field => beforeData?.[field] !== afterData?.[field]);
    
    if (hasChanges) {
      console.log("Configurações de custos de serviço mudaram. Iniciando cadeia de atualização via Pub/Sub...");
      
      // Publicar mensagem para iniciar a cadeia
      await pubsubClient.topic(TOPICO_ATUALIZAR_PECAS).publishMessage({
        data: Buffer.from(JSON.stringify({ 
          tipo: "serviceCosts",
          timestamp: new Date().toISOString()
        }))
      });
      
      console.log(`Mensagem publicada no tópico ${TOPICO_ATUALIZAR_PECAS}`);
    }
  } catch (error) {
    console.error("Erro no trigger onUpdateServiceCosts:", error);
    throw error;
  }
});

// ========== TRIGGERS REDUNDANTES REMOVIDOS ==========
// Os seguintes triggers foram removidos porque:
// 1. Cálculo de custo já é feito no frontend (pecas/page.tsx, ModeloFormModal.jsx, KitFormModal.jsx)
// 2. Eles causam concorrência desnecessária
// 3. O encadeamento peça→modelo→kit é feito via Pub/Sub quando preços base mudam
//
// REMOVIDOS:
// - onWritePeca
// - onWriteModelo  
// - onWriteKit

/**
 * Função HTTP para forçar recálculo de um produto específico
 */
export const recalcularCustoProdutoHttp = onRequest(async (req: any, res: any) => {
  try {
    const { produtoId, tipo } = req.query;
    
    if (!produtoId || !tipo) {
      res.status(400).json({
        error: "Parâmetros obrigatórios: produtoId e tipo (peca|modelo|kit)"
      });
      return;
    }
    
    if (!['peca', 'modelo', 'kit'].includes(tipo as string)) {
      res.status(400).json({
        error: "Tipo inválido. Use: peca, modelo ou kit"
      });
      return;
    }
    
    console.log(`Recálculo manual solicitado para ${produtoId} (${tipo})`);
    const result = await recalcularCustoProduto(produtoId as string, tipo as 'peca' | 'modelo' | 'kit');
    
    res.status(200).json({
      success: true,
      produtoId,
      tipo,
      custo: result.custo,
      detalhado: result.detalhado
    });
  } catch (error) {
    console.error("Erro no recálculo manual:", error);
    res.status(500).json({
      error: "Erro interno no servidor",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Função HTTP para iniciar cadeia completa de atualização
 */
export const iniciarAtualizacaoCompletaHttp = onRequest(async (req: any, res: any) => {
  try {
    console.log("Iniciando atualização completa via HTTP");
    
    // Publicar mensagem para iniciar a cadeia
    await pubsubClient.topic(TOPICO_ATUALIZAR_PECAS).publishMessage({
      data: Buffer.from(JSON.stringify({ 
        tipo: "manual",
        origem: "http",
        timestamp: new Date().toISOString()
      }))
    });
    
    res.status(200).json({
      success: true,
      message: "Cadeia de atualização iniciada",
      topicos: [TOPICO_ATUALIZAR_PECAS, TOPICO_ATUALIZAR_MODELOS, TOPICO_ATUALIZAR_KITS]
    });
  } catch (error) {
    console.error("Erro ao iniciar atualização completa:", error);
    res.status(500).json({
      error: "Erro interno no servidor",
      details: error instanceof Error ? error.message : String(error)
    });
  }
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
    await processLancamentosServico(event);
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
            case 'entrada_kit_embalagem': // New case
                return await handleEntradaKitEmbalagem(event);
            case 'conclusao_montagem_kit': // New case
                const { handleConclusaoMontagemKit } = await import('./handlers/production/handleConclusaoMontagemKit.js');
                return await handleConclusaoMontagemKit({ data: event.data as admin.firestore.QueryDocumentSnapshot });
            case 'conclusao_pedido': // NEW: Centralized conclusion handler
                return await handleConclusaoPedido(event);
            case 'uso_estoque': // NEW: Uso de estoque handler
                return await handleUsoEstoqueOtimizado(event.data as admin.firestore.QueryDocumentSnapshot);
            case 'estoque_excedente': // NEW: Estoque excedente handler
                return await handleEstoqueExcedente(event.data as admin.firestore.QueryDocumentSnapshot);
            default:
                console.error(`Tipo de evento desconhecido: ${lancamento.tipoEvento}`);
                throw new Error(`Tipo de evento desconhecido: ${lancamento.tipoEvento}`);
        }
    } catch (error) {
        console.error('Erro no processamento do lançamento de produção:', error);
        throw error;
    }
});

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { LancamentoServico, Impressao3DPayload, MontagemPayload, EmbalagemPayload, ServicoMensal, ServicoEvento } from "../types/productionTypes";

// Função auxiliar para formatar mes_ano
function getMesAnoReferencia(data: Date): string {
    const meses = [
        'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    
    const mes = meses[data.getMonth()];
    const ano = data.getFullYear();
    
    return `${mes}_${ano}`;
}

// Função para gerar ID do documento de serviço
function gerarIdDocumentoServico(serviceType: string, data: Date): string {
    const mesAno = getMesAnoReferencia(data);
    return `${serviceType}_${mesAno}`;
}


// Função principal simplificada e renomeada
export async function processLancamentosServico(event: any) {
    const FUNCTION_VERSION = "2.1.0";
    const db = admin.firestore();
    const lancamentoId = event.params.lancamentoId;

    functions.logger.log(`[${lancamentoId}] TRIGGERED: processLancamentosServico v${FUNCTION_VERSION}.`);
    const lancamento = event.data?.data() as LancamentoServico;

    if (!lancamento) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { serviceType, payload } = lancamento;

    if (!serviceType || !payload) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing serviceType or payload.`);
        return;
    }

    try {
        // 1. Obter configurações de custos (READ fora da transação principal)
        const settingsDoc = await db.collection('settings').doc('serviceCosts').get();
        let custoPorMinuto = 0;

        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            switch (serviceType) {
                case 'impressao_3d':
                    custoPorMinuto = settings?.costPerMinute3DPrint || 0;
                    break;
                case 'montagem':
                    custoPorMinuto = settings?.costPerMinuteAssembly || 0;
                    break;
                case 'embalagem':
                    custoPorMinuto = settings?.costPerMinutePackaging || 0;
                    break;
            }
        }

        if (custoPorMinuto === 0) {
            functions.logger.warn(`[${lancamentoId}] Cost per minute not configured for service type: ${serviceType}`);
        }

        // 2. Calcular total e custo
        const total = payload.total;
        const custo = total * custoPorMinuto;

        // 3. Gerar ID do documento mensal e mês/ano
        const dataObj = lancamento.data.toDate();
        const documentoId = gerarIdDocumentoServico(serviceType, dataObj);
        const mesAno = getMesAnoReferencia(dataObj);

        // 4. Criar evento para o array
        const evento: ServicoEvento = {
            id: lancamentoId,
            origem: lancamento.origem === 'producao' ? 'produção' : lancamento.origem,
            pedidoId: payload.pedidoId || null,
            optimizedGroupId: serviceType === 'impressao_3d' 
                ? (payload as Impressao3DPayload).optimizedGroupId 
                : null,
            assemblyGroup: (serviceType === 'montagem' || serviceType === 'embalagem')
                ? (payload as MontagemPayload | EmbalagemPayload).assemblyGroup
                : null,
            total: total,
            custo: custo,
            data: lancamento.data,
            usuario: lancamento.usuario
        };

        // 5. Atualizar coleção servicos com transação (READ antes de WRITE)
        await db.runTransaction(async (transaction) => {
            const servicoRef = db.collection('servicos').doc(documentoId);
            // READ: Ler documento atual
            const servicoDoc = await transaction.get(servicoRef);

            if (!servicoDoc.exists) {
                // Criar novo documento mensal (WRITE)
                const novoServico: ServicoMensal = {
                    serviceType: serviceType,
                    mes_ano: mesAno,
                    total: total,
                    custo_total: custo,
                    eventos: [evento],
                    createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp
                };
                transaction.create(servicoRef, novoServico);
                functions.logger.log(`[${lancamentoId}] Created new monthly service document: ${documentoId}`);
            } else {
                // Atualizar documento existente (WRITE)
                const servicoData = servicoDoc.data() as ServicoMensal;
                const updateData = {
                    total: servicoData.total + total,
                    custo_total: servicoData.custo_total + custo,
                    eventos: admin.firestore.FieldValue.arrayUnion(evento),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                transaction.update(servicoRef, updateData);
                functions.logger.log(`[${lancamentoId}] Updated monthly service document: ${documentoId}`);
            }
        });

        functions.logger.log(`[${lancamentoId}] Successfully processed service launch for ${serviceType}. Total: ${total}min, Cost: R$${custo.toFixed(2)}`);

    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Error processing service launch:`, error);
    }
}
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getWeek } from 'date-fns';
import { 
    Servico, 
    LancamentoServico 
} from "../../../src/app/types";

export async function processarLancamentoServicoUtil(event: any) {
    const FUNCTION_VERSION = "1.0.0";
    const db = admin.firestore();
    const lancamentoId = event.params.lancamentoId;

    functions.logger.log(`[${lancamentoId}] TRIGGERED: processarLancamentoServico v${FUNCTION_VERSION}.`);
    const lancamento = event.data?.data() as LancamentoServico;

    if (!lancamento) {
        functions.logger.error(`[${lancamentoId}] Document data is empty. Aborting.`);
        return;
    }

    const { servicoId, quantidade, data } = lancamento;

    if (!servicoId || !quantidade || !data) {
        functions.logger.error(`[${lancamentoId}] Invalid lancamento data: Missing servicoId, quantidade, or data.`);
        return;
    }

    try {
        const servicoRef = db.collection("servicos").doc(servicoId);
        const servicoDoc = await servicoRef.get();
        if (!servicoDoc.exists) {
            functions.logger.error(`[${lancamentoId}] Service with ID ${servicoId} not found.`);
            return;
        }
        const servico = servicoDoc.data() as Servico;
        const custoTotalLancamento = servico.custoPorUnidade * quantidade;

        const dateObj = data.toDate();
        const reportId = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        const dayKey = String(dateObj.getDate()).padStart(2, '0'); // DD
        const weekKey = `${dateObj.getFullYear()}-${getWeek(dateObj, { weekStartsOn: 1 })}`; // YYYY-WW

        const reportRef = db.collection("relatoriosServicos").doc(reportId);

        await db.runTransaction(async (transaction) => {
            const reportDoc = await transaction.get(reportRef);

            if (reportDoc.exists) {
                const processedIds = reportDoc.data()?.lancamentosProcessadosIds || [];
                if (processedIds.includes(lancamentoId)) {
                    functions.logger.warn(`[${lancamentoId}] Lancamento already processed. Skipping.`);
                    return;
                }
            }

            const dailyQtyPath = `resumoDiario.${dayKey}.${servicoId}.totalQuantidade`;
            const dailyCostPath = `resumoDiario.${dayKey}.${servicoId}.totalCusto`;
            const weeklyQtyPath = `resumoSemanal.${weekKey}.${servicoId}.totalQuantidade`;
            const weeklyCostPath = `resumoSemanal.${weekKey}.${servicoId}.totalCusto`;
            const monthlyQtyPath = `resumoMensal.${servicoId}.totalQuantidade`;
            const monthlyCostPath = `resumoMensal.${servicoId}.totalCusto`;

            const updateData = {
                [dailyQtyPath]: admin.firestore.FieldValue.increment(quantidade),
                [dailyCostPath]: admin.firestore.FieldValue.increment(custoTotalLancamento),
                [weeklyQtyPath]: admin.firestore.FieldValue.increment(quantidade),
                [weeklyCostPath]: admin.firestore.FieldValue.increment(custoTotalLancamento),
                [monthlyQtyPath]: admin.firestore.FieldValue.increment(quantidade),
                [monthlyCostPath]: admin.firestore.FieldValue.increment(custoTotalLancamento),
                lancamentosProcessadosIds: admin.firestore.FieldValue.arrayUnion(lancamentoId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                id: reportId,
            };

            transaction.set(reportRef, updateData, { merge: true });
        });

        functions.logger.log(`[${lancamentoId}] Successfully processed service launch and updated report ${reportId}.`);

    } catch (error) {
        functions.logger.error(`[${lancamentoId}] Error processing service launch:`, error);
    }
}

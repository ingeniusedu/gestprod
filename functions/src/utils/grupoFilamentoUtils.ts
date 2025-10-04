import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

export async function updateGrupoDeFilamentoUtil(event: any) {
    const FUNCTION_VERSION = "1.0.2";
    const db = admin.firestore();
    const insumoId = event.params.insumoId;

    functions.logger.log(`[updateGrupoDeFilamento - START] (Version: ${FUNCTION_VERSION}) Triggered for insumoId: ${insumoId}`);

    const document = event.data?.after.exists ? event.data.after.data() : null;
    const oldDocument = event.data?.before.exists ? event.data.before.data() : null;

    const insumo = document || oldDocument;
    if (!insumo) {
        functions.logger.log(`[updateGrupoDeFilamento] Insumo document is null, likely deleted. Exiting.`);
        return;
    }
    if (insumo.tipo !== "filamento") {
        functions.logger.log(`[updateGrupoDeFilamento] Insumo ${insumoId} is not a filament, exiting.`);
        return;
    }

    const grupoFilamentoId = insumo.especificacoes?.grupoFilamentoId;
    if (!grupoFilamentoId) {
        functions.logger.log(
            `[updateGrupoDeFilamento] Insumo ${insumoId} does not have especificacoes.grupoFilamentoId. Exiting.`
        );
        return;
    }

    const insumosRef = db.collection("insumos");
    const spoolsSnapshot = await insumosRef
        .where("especificacoes.grupoFilamentoId", "==", grupoFilamentoId)
        .get();

    if (spoolsSnapshot.empty) {
        functions.logger.log(
            `[updateGrupoDeFilamento] No spools found for group ${grupoFilamentoId}, deleting the group.`
        );
        await db.collection("gruposDeFilamento").doc(grupoFilamentoId).delete();
        return;
    }

    let totalGramas = 0;
    let custoTotal = 0;
    let totalConsumoProducao = 0;
    let totalConsumoReal = 0;
    const spoolsEmEstoqueIds: string[] = [];

    spoolsSnapshot.forEach((doc) => {
        const spool = doc.data();
        const estoqueDoSpool = spool.estoqueAtual || 0;

        if (estoqueDoSpool > 0) {
            totalGramas += estoqueDoSpool;
            custoTotal += (spool.custoPorUnidade || 0) * estoqueDoSpool;
            spoolsEmEstoqueIds.push(doc.id);
        }
        totalConsumoProducao += spool.consumoProducao || 0;
        totalConsumoReal += spool.consumoReal || 0;
    });

    const custoMedioPonderado = totalGramas > 0 ? custoTotal / totalGramas : 0;

    const grupoRef = db.collection("gruposDeFilamento").doc(grupoFilamentoId);

    functions.logger.log(
        `[updateGrupoDeFilamento] Updating group ${grupoFilamentoId}:`,
        `Custo Médio: ${custoMedioPonderado}`,
        `Estoque Total: ${totalGramas}`,
        `Spools em Estoque IDs: ${spoolsEmEstoqueIds}`,
        `Consumo Produção: ${totalConsumoProducao}`,
        `Consumo Real: ${totalConsumoReal}`
    );

    await grupoRef.set({
        custoMedioPonderado: custoMedioPonderado,
        estoqueTotalGramas: totalGramas,
        spoolsEmEstoqueIds: spoolsEmEstoqueIds,
        consumoProducao: totalConsumoProducao,
        consumoReal: totalConsumoReal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

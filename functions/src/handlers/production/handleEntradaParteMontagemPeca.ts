import * as admin from "firebase-admin";
import { QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import { LancamentoProducao, GrupoMontagem, ParteProduzidaPayload } from "../../types/productionTypes";

export async function handleEntradaParteMontagemPeca(
    snapshot: QueryDocumentSnapshot
) {
    const db = admin.firestore();
    const lancamento = snapshot.data() as LancamentoProducao;
    const payload = lancamento.payload as {
        parentPecaId: string;
        pecaTipoDetalhado: string;
        partesProduzidas: ParteProduzidaPayload[];
    };

    if (!payload || !payload.parentPecaId || !payload.partesProduzidas || payload.partesProduzidas.length === 0) {
        console.error("Payload inválido para entrada_parte_montagem_peca:", payload);
        throw new Error("Payload inválido para entrada_parte_montagem_peca.");
    }

    // Group partesProduzidas by assemblyInstanceId
    const partesProduzidasByAssemblyInstance = payload.partesProduzidas.reduce((acc, parte) => {
        if (!acc[parte.assemblyInstanceId]) {
            acc[parte.assemblyInstanceId] = [];
        }
        acc[parte.assemblyInstanceId].push(parte);
        return acc;
    }, {} as { [key: string]: ParteProduzidaPayload[] });

    const updatedGrupoMontagemIds: string[] = [];

    await db.runTransaction(async (transaction) => {
        const grupoMontagemDocs: { [assemblyInstanceId: string]: admin.firestore.QueryDocumentSnapshot } = {};

        // Phase 1: Read all necessary GrupoMontagem documents
        for (const assemblyInstanceId in partesProduzidasByAssemblyInstance) {
            const grupoMontagemRef = db.collection("gruposMontagem").where("assemblyInstanceId", "==", assemblyInstanceId).limit(1);
            const grupoMontagemSnapshot = await transaction.get(grupoMontagemRef);

            if (grupoMontagemSnapshot.empty) {
                console.warn(`GrupoMontagem não encontrado para assemblyInstanceId: ${assemblyInstanceId}. Ignorando partes para esta instância.`);
                continue;
            }
            grupoMontagemDocs[assemblyInstanceId] = grupoMontagemSnapshot.docs[0];
        }

        // Phase 2: Perform all writes based on the read documents
        for (const assemblyInstanceId in grupoMontagemDocs) {
            const partesForThisInstance = partesProduzidasByAssemblyInstance[assemblyInstanceId];
            const grupoMontagemDoc = grupoMontagemDocs[assemblyInstanceId];
            const grupoMontagem = grupoMontagemDoc.data() as GrupoMontagem;

            const updatedPartesNecessarias = [...(grupoMontagem.partesNecessarias || [])];

            partesForThisInstance.forEach((parteProduzida) => {
                const parteNecessariaIndex = updatedPartesNecessarias.findIndex(
                    (pn) => pn.parteId === parteProduzida.parteId
                );

                if (parteNecessariaIndex > -1) {
                    const parteNecessaria = updatedPartesNecessarias[parteNecessariaIndex];
                    if (!parteNecessaria.atendimentoDetalhado) {
                        parteNecessaria.atendimentoDetalhado = [];
                    }
                    parteNecessaria.atendimentoDetalhado.push({
                        origem: "producao",
                        quantidade: parteProduzida.quantidade,
                        timestamp: new Date(),
                    });
                    updatedPartesNecessarias[parteNecessariaIndex] = parteNecessaria;
                } else {
                    console.warn(`Parte ${parteProduzida.parteId} não encontrada em partesNecessarias para GrupoMontagem ${grupoMontagemDoc.id}`);
                }
            });

            const updateData: Partial<GrupoMontagem> = {
                partesNecessarias: updatedPartesNecessarias,
            };

            transaction.update(grupoMontagemDoc.ref, updateData);
            updatedGrupoMontagemIds.push(grupoMontagemDoc.id);
        }
    });

    console.log(`GruposMontagem atualizados: ${updatedGrupoMontagemIds.join(', ')}. Status não alterado conforme solicitação.`);
}

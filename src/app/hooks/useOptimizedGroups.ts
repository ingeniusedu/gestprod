import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { OptimizedGroup, Insumo, Peca, Parte, Modelo, Kit, GrupoDeFilamento } from '../types';
import { LocalProduto, LocalInsumo, Recipiente } from '../types/mapaEstoque';
import { useStockCalculations } from './useStockCalculations';

export const useOptimizedGroups = (
  allInsumosData: Insumo[],
  pecasData: Peca[],
  partesData: Parte[],
  modelsData: Modelo[],
  kitsData: Kit[],
  filamentGroupsData: GrupoDeFilamento[],
  locaisProdutosData: LocalProduto[],
  locaisInsumosData: LocalInsumo[],
  recipientesData: Recipiente[]
) => {
  const [optimizedGroups, setOptimizedGroups] = useState<Map<string, OptimizedGroup>>(new Map());
  const { getStockForProduct } = useStockCalculations();

  const fetchAwaitingProductionGroups = useCallback(() => {
    const q = query(collection(db, 'gruposProducaoOtimizados'), where('status', '==', 'aguardando'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const rawAwaitingGroups: OptimizedGroup[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const group: OptimizedGroup = {
          id: String(doc.id),
          partesNoGrupo: data.partesNoGrupo || {},
          totalPartsQuantity: data.totalPartsQuantity || 0,
          aggregatedGroupCount: data.aggregatedGroupCount || 0,
          pedidosOrigem: data.pedidosOrigem || [],
          sourceName: data.sourceName || 'N/A',
          tempoImpressaoGrupo: data.tempoImpressaoGrupo || 0,
          corFilamento: data.corFilamento || 'N/A',
          filamentosNecessarios: data.filamentosNecessarios || [],
          outrosInsumosNecessarios: data.outrosInsumosNecessarios || [],
          insumosProntos: data.insumosProntos || false,
          partesProntas: data.partesProntas || false,
          status: data.status || 'aguardando',
          parentPecaId: data.parentPecaId,
          parentModeloId: data.parentModeloId,
          parentKitId: data.parentKitId,
          pecaTipoDetalhado: data.pecaTipoDetalhado,
        };
        return group;
      });

      const enrichedGroups = rawAwaitingGroups.map(group => {
        const partesNoGrupo = group.partesNoGrupo || {};

        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          const { estoqueTotal } = getStockForProduct(parteId, 'parte', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          partesNoGrupo[parteId] = {
            ...parteInfo,
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: isNaN(Number(parteInfo.quantidade)) ? 0 : Number(parteInfo.quantidade),
          };
        }

        const filamentosNecessarios = group.filamentosNecessarios.map(filamento => {
          const { estoqueTotal } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const filamentGroupDetails = filamentGroupsData.find(fg => fg.id === filamento.id);
          return {
            ...filamento,
            nome: filamentGroupDetails?.nome || filamento.nome || 'Desconhecido',
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: isNaN(Number(filamento.quantidade)) ? 0 : Number(filamento.quantidade),
          };
        });

        const outrosInsumosNecessarios = (group.outrosInsumosNecessarios || []).map(insumo => {
          const { estoqueTotal } = getStockForProduct(insumo.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const insumoDetails = allInsumosData.find(i => i.id === insumo.id);
          return {
            ...insumo,
            nome: insumoDetails?.nome || insumo.nome || 'Desconhecido',
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: isNaN(Number(insumo.quantidade)) ? 0 : Number(insumo.quantidade),
          };
        });

        let allPartsReady = true;
        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          if ((parteInfo.estoqueAtual || 0) < (parteInfo.quantidadeNecessaria || 0)) {
            allPartsReady = false;
            break;
          }
        }

        let allInsumosReady = true;
        for (const filamento of filamentosNecessarios) {
          if ((filamento.estoqueAtual || 0) < (filamento.quantidadeNecessaria || 0)) {
            allInsumosReady = false;
            break;
          }
        }
        if (allInsumosReady) {
          for (const insumo of outrosInsumosNecessarios) {
            if ((insumo.estoqueAtual || 0) < (insumo.quantidadeNecessaria || 0)) {
              allInsumosReady = false;
              break;
            }
          }
        }

        return {
          ...group,
          partesNoGrupo,
          filamentosNecessarios,
          outrosInsumosNecessarios,
          partesProntas: allPartsReady,
          insumosProntos: allInsumosReady,
        };
      });

      const optimizedMap = new Map<string, OptimizedGroup>();
      enrichedGroups.forEach(group => optimizedMap.set(group.id, group));
      setOptimizedGroups(optimizedMap);
    }, (error) => {
      console.error("Error fetching awaiting production groups with onSnapshot: ", error);
    });

    return unsubscribe;
  }, [getStockForProduct, allInsumosData, pecasData, partesData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData]);

  const fetchInProductionOptimizedGroups = useCallback(() => {
    const q = query(collection(db, 'gruposProducaoOtimizados'), where('status', '==', 'em_producao'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const rawInProductionGroups: OptimizedGroup[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const group: OptimizedGroup = {
          id: String(doc.id),
          partesNoGrupo: data.partesNoGrupo || {},
          totalPartsQuantity: data.totalPartsQuantity || 0,
          aggregatedGroupCount: data.aggregatedGroupCount || 0,
          pedidosOrigem: data.pedidosOrigem || [],
          sourceName: data.sourceName || 'N/A',
          tempoImpressaoGrupo: data.tempoImpressaoGrupo || 0,
          corFilamento: data.corFilamento,
          filamentosNecessarios: data.filamentosNecessarios || [],
          outrosInsumosNecessarios: data.outrosInsumosNecessarios || [],
          insumosProntos: data.insumosProntos || false,
          partesProntas: data.partesProntas || false,
          status: data.status || 'em_producao',
          parentPecaId: data.parentPecaId,
          parentModeloId: data.parentModeloId,
          parentKitId: data.parentKitId,
          pecaTipoDetalhado: data.pecaTipoDetalhado,
        };
        return group;
      });

      const enrichedGroups = rawInProductionGroups.map(group => {
        const partesNoGrupo = group.partesNoGrupo || {};

        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          const { estoqueTotal } = getStockForProduct(parteId, 'parte', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          partesNoGrupo[parteId] = {
            ...parteInfo,
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: isNaN(Number(parteInfo.quantidade)) ? 0 : Number(parteInfo.quantidade),
          };
        }

        const filamentosNecessarios = group.filamentosNecessarios.map(filamento => {
          const { estoqueTotal } = getStockForProduct(filamento.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const filamentGroupDetails = filamentGroupsData.find(fg => fg.id === filamento.id);
          return {
            ...filamento,
            nome: filamentGroupDetails?.nome || filamento.nome || 'Desconhecido',
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: isNaN(Number(filamento.quantidade)) ? 0 : Number(filamento.quantidade),
          };
        });

        const outrosInsumosNecessarios = (group.outrosInsumosNecessarios || []).map(insumo => {
          const { estoqueTotal } = getStockForProduct(insumo.id, 'insumo', pecasData, partesData, allInsumosData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData);
          const insumoDetails = allInsumosData.find(i => i.id === insumo.id);
          return {
            ...insumo,
            nome: insumoDetails?.nome || insumo.nome || 'Desconhecido',
            estoqueAtual: estoqueTotal,
            quantidadeNecessaria: isNaN(Number(insumo.quantidade)) ? 0 : Number(insumo.quantidade),
          };
        });

        let allPartsReady = true;
        for (const parteId in partesNoGrupo) {
          const parteInfo = partesNoGrupo[parteId];
          if ((parteInfo.estoqueAtual || 0) < (parteInfo.quantidadeNecessaria || 0)) {
            allPartsReady = false;
            break;
          }
        }

        let allInsumosReady = true;
        for (const filamento of filamentosNecessarios) {
          if ((filamento.estoqueAtual || 0) < (filamento.quantidadeNecessaria || 0)) {
            allInsumosReady = false;
            break;
          }
        }
        if (allInsumosReady) {
          for (const insumo of outrosInsumosNecessarios) {
            if ((insumo.estoqueAtual || 0) < (insumo.quantidadeNecessaria || 0)) {
              allInsumosReady = false;
              break;
            }
          }
        }

        return {
          ...group,
          partesNoGrupo,
          filamentosNecessarios,
          outrosInsumosNecessarios,
          partesProntas: allPartsReady,
          insumosProntos: allInsumosReady,
        };
      });

      setOptimizedGroups(prev => {
        const updatedMap = new Map(prev);
        enrichedGroups.forEach(group => updatedMap.set(group.id, group));
        return updatedMap;
      });
    }, (error) => {
      console.error("Error fetching in production optimized groups with onSnapshot: ", error);
    });

    return unsubscribe;
  }, [getStockForProduct, allInsumosData, pecasData, partesData, modelsData, kitsData, filamentGroupsData, locaisProdutosData, locaisInsumosData, recipientesData]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubscribeAwaiting = fetchAwaitingProductionGroups();
        const unsubscribeInProduction = fetchInProductionOptimizedGroups();

        return () => {
          unsubscribeAwaiting();
          unsubscribeInProduction();
        };
      } else {
        // Clear groups if user is not authenticated
        setOptimizedGroups(new Map());
        return () => {}; // Return empty cleanup function
      }
    });

    return () => unsubscribeAuth();
  }, [fetchAwaitingProductionGroups, fetchInProductionOptimizedGroups]);

  return { optimizedGroups };
};

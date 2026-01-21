import { useCallback } from 'react';
import { collection, doc, addDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { v4 as uuidv4 } from 'uuid';
import { cleanObject } from '../utils/cleanObject';
import { OptimizedGroup, GrupoMontagem, ConcludeData, LancamentoInsumo, LancamentoProduto, LancamentoServico, PosicaoEstoque } from '../types';
import toast from 'react-hot-toast';

export const useProductionActions = () => {
  const updateProductionGroupStatus = useCallback(async (pedidoId: string, groupId: string, newStatus: OptimizedGroup['status']) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para atualizar o status da produção.");
      return;
    }
    try {
      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'atualizacao_status_grupo_otimizado',
        payload: {
          optimizedGroupId: groupId,
          newStatus: newStatus,
          pedidoId: pedidoId,
        },
        timestamp: serverTimestamp(),
        usuario: auth.currentUser.uid,
      }));
      toast.success(`Status do grupo de produção atualizado para '${newStatus}' com sucesso!`);
    } catch (error) {
      console.error("Erro ao atualizar status do grupo de produção otimizado: ", error);
      toast.error("Ocorreu um erro ao atualizar o status. Verifique o console para mais detalhes.");
    }
  }, []);

  const revertProductionGroupStatus = useCallback(async (pedidoId: string, groupId: string, currentStatus: OptimizedGroup['status']) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para reverter o status da produção.");
      return;
    }
    try {
      if (currentStatus === 'em_producao') {
        await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
          tipoEvento: 'reversao_status_grupo_otimizado',
          payload: {
            optimizedGroupId: groupId,
            oldStatus: currentStatus,
            newStatus: 'aguardando',
            pedidoId: pedidoId,
          },
          timestamp: serverTimestamp(),
          usuario: auth.currentUser.uid,
        }));
        toast.success("Status do grupo de produção revertido para 'aguardando' com sucesso!");
      } else {
        toast.error("Reversão de status não suportada para o status atual.");
      }
    } catch (error) {
      console.error("Erro ao reverter status do grupo de produção otimizado: ", error);
      toast.error("Ocorreu um erro ao reverter o status. Verifique o console para mais detalhes.");
    }
  }, []);

  const handleStartOptimizedProduction = useCallback(async (group: OptimizedGroup) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para iniciar a produção.");
      return;
    }
    try {
      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'inicio_producao',
        payload: {
          groupId: group.id,
        },
        timestamp: serverTimestamp(),
        usuario: auth.currentUser.uid,
      }));

      toast.success("Solicitação para iniciar produção enviada com sucesso! O status será atualizado em breve.");
    } catch (error) {
      console.error("Erro ao solicitar início de produção otimizada: ", error);
      toast.error("Ocorreu um erro ao solicitar o início da produção. Verifique o console para mais detalhes.");
    }
  }, []);

  const handleConcludeProduction = useCallback(async (data: ConcludeData) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a produção.");
      return;
    }

    const batch = writeBatch(db);
    const lancamentoProducaoRef = doc(collection(db, 'lancamentosProducao'));
    const { group, producedParts } = data;

    try {
      batch.set(lancamentoProducaoRef, cleanObject({
        id: lancamentoProducaoRef.id,
        tipoEvento: 'conclusao_producao',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: {
          groupId: group.id,
          quantidadeProduzida: producedParts.reduce((sum, part) => sum + part.quantidadeProduzida, 0),
          locaisDestino: producedParts.flatMap(part => part.locais || []),
          group: group,
          producedParts: producedParts,
          optimizedGroupId: group.id,
          pedidosOrigem: group.pedidosOrigem,
          sourceName: group.sourceName,
        },
      }));

      // Lançar insumos consumidos (filamentos)
      for (const filamento of group.filamentosNecessarios) {
        if (filamento.quantidade > 0) {
          const lancamentoInsumoRef = doc(collection(db, 'lancamentosInsumos'));
          batch.set(lancamentoInsumoRef, cleanObject({
            id: uuidv4(),
            insumoId: filamento.id,
            tipoInsumo: 'filamento',
            tipoMovimento: 'saida',
            quantidade: filamento.quantidade,
            unidadeMedida: 'gramas',
            data: Timestamp.now(),
            detalhes: `Consumo para grupo de impressão otimizado: ${group.sourceName} (ID: ${group.id})`,
            locais: filamento.localEstoqueFilamento || [],
            pedidoId: group.pedidosOrigem[0]?.pedidoId,
          } as LancamentoInsumo));
        }
      }

      // Lançar outros insumos consumidos
      for (const insumo of (group.outrosInsumosNecessarios || [])) {
        if (insumo.quantidade > 0 && insumo.etapaInstalacao === 'impressao') {
          const lancamentoInsumoRef = doc(collection(db, 'lancamentosInsumos'));
          batch.set(lancamentoInsumoRef, cleanObject({
            id: uuidv4(),
            insumoId: insumo.id,
            tipoInsumo: insumo.tipo as 'material' | 'outros',
            tipoMovimento: 'saida',
            quantidade: insumo.quantidade,
            unidadeMedida: insumo.tipo === 'tempo' ? 'horas' : 'unidades',
            data: Timestamp.now(),
            detalhes: `Consumo para grupo de impressão otimizado: ${group.sourceName} (ID: ${group.id})`,
            locais: insumo.localEstoqueInsumo || [],
            pedidoId: group.pedidosOrigem[0]?.pedidoId,
          } as LancamentoInsumo));
        }
      }

      // Lançar tempo de serviço
      if (group.tempoImpressaoGrupo > 0) {
        const lancamentoServicoRef = doc(collection(db, 'lancamentosServicos'));
        batch.set(lancamentoServicoRef, cleanObject({
          serviceType: 'impressao_3d',
          origem: 'pedido',
          usuario: auth.currentUser?.displayName || 'Sistema',
          data: Timestamp.now(),
          payload: {
            total: group.tempoImpressaoGrupo,
            pedidoId: group.pedidosOrigem[0]?.pedidoId,
            optimizedGroupId: group.id
          }
        } as LancamentoServico));
      }

      // Lançar produtos produzidos (partes)
      for (const parteProduzida of producedParts) {
        if (parteProduzida.quantidadeProduzida > 0) {
          const lancamentoProdutoRef = doc(collection(db, 'lancamentosProdutos'));
          const parteInfo = group.partesNoGrupo[parteProduzida.parteId];
          const expectedQuantity = parteInfo.quantidade;
          const isExcess = parteProduzida.quantidadeProduzida > expectedQuantity;

          let locaisParaLancamento: LancamentoProduto['locais'] = [];

          if (isExcess && parteProduzida.destinoExcedente === 'estoque' && parteProduzida.locais) {
            locaisParaLancamento = parteProduzida.locais.map(local => ({
              localId: local.recipienteId,
              recipienteId: local.recipienteId,
              divisao: ('divisao' in local && local.divisao && typeof local.divisao === 'object' && 'h' in local.divisao && 'v' in local.divisao) 
                ? local.divisao as { h: number; v: number } 
                : null,
              quantidade: local.quantidade,
            }));
          } else if (!isExcess || parteProduzida.destinoExcedente === 'montagem') {
            continue;
          }

          if (locaisParaLancamento.length > 0) {
            batch.set(lancamentoProdutoRef, cleanObject({
              id: uuidv4(),
              produtoId: parteProduzida.parteId,
              tipoProduto: 'parte',
              tipoMovimento: 'entrada',
              usuario: auth.currentUser?.displayName || 'Sistema',
              observacao: `Conclusão de produção - Excedente para estoque do grupo otimizado: ${group.sourceName} (ID: ${group.id})`,
              data: Timestamp.now(),
              locais: locaisParaLancamento,
            } as LancamentoProduto));
          }
        }
      }

      await batch.commit();
      toast.success("Evento de conclusão de produção disparado com sucesso! O status será atualizado em breve.");
    } catch (error) {
      console.error("Erro ao disparar evento de conclusão de produção:", error);
      toast.error("Ocorreu um erro ao concluir a produção. Verifique o console para mais detalhes.");
    }
  }, []);

  const handleStockSelection = useCallback(async (debits: { selectedPosition: PosicaoEstoque; quantityToDebit: number }[], itemToDebit: { id: string; nome: string; type: string }) => {
    const { id, nome, type } = itemToDebit;
    let totalDebited = 0;

    if (!['parte', 'peca', 'modelo', 'kit'].includes(type)) {
      toast.error(`O tipo de item '${type}' não é um produto válido para lançamento de estoque nesta operação.`);
      return;
    }

    try {
      const batch = writeBatch(db);
      for (const debit of debits) {
        if (debit.quantityToDebit > 0) {
          const lancamentoProduto: LancamentoProduto = {
            id: uuidv4(),
            produtoId: id,
            tipoProduto: type as LancamentoProduto['tipoProduto'],
            tipoMovimento: 'saida',
            usuario: auth.currentUser?.displayName || 'Sistema de Produção (Visão Geral)',
            observacao: `Débito de estoque manual para ${nome} (SKU: ${id})`,
            data: Timestamp.fromDate(new Date()),
            locais: [
              {
                recipienteId: debit.selectedPosition.recipienteId,
                divisao: debit.selectedPosition.divisao,
                quantidade: debit.quantityToDebit,
                localId: debit.selectedPosition.localId || '',
              }
            ]
          };
          batch.set(doc(collection(db, 'lancamentosProdutos')), cleanObject(lancamentoProduto));
          totalDebited += debit.quantityToDebit;
        }
      }
      await batch.commit();
      
      toast.success(`Lançamento de saída de estoque para ${nome} criado com sucesso! Quantidade: ${totalDebited}`);
    } catch (error) {
      console.error("Error during manual stock debit from summary: ", error);
      toast.error("Ocorreu um erro ao criar o lançamento de estoque. Verifique o console para mais detalhes.");
    }
  }, []);

  const handleConcluirMontagemPeca = useCallback(async (assemblyGroup: GrupoMontagem) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a montagem.");
      return;
    }

    try {
      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'conclusao_montagem_peca',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: {
          assemblyGroupId: assemblyGroup.id,
          targetProductId: assemblyGroup.targetProductId,
          targetProductType: assemblyGroup.targetProductType,
          parentModeloId: assemblyGroup.parentModeloId,
          parentKitId: assemblyGroup.parentKitId,
          usuarioId: auth.currentUser.uid,
        },
      }));
      
      toast.success("Solicitação de conclusão de montagem de peça enviada com sucesso! O status será atualizado em breve.");
    } catch (error) {
      console.error("Erro ao solicitar conclusão de montagem de peça:", error);
      toast.error("Ocorreu um erro ao solicitar a conclusão da montagem. Verifique o console para mais detalhes.");
    }
  }, []);

  const handleConcluirMontagemModelo = useCallback(async (assemblyGroup: GrupoMontagem) => {
    if (!auth.currentUser) {
      toast.error("Você precisa estar logado para concluir a montagem.");
      return;
    }

    try {
      const tipoProximoEvento = assemblyGroup.parentKitId 
        ? 'entrada_modelo_montagem_kit' 
        : 'entrada_modelo_embalagem';

      const payload: Record<string, any> = {
        assemblyGroupId: assemblyGroup.id ?? '',
        assemblyInstanceId: assemblyGroup.assemblyInstanceId ?? null,
        targetProductId: assemblyGroup.targetProductId ?? '',
        targetProductType: 'modelo',
        parentModeloId: assemblyGroup.parentModeloId ?? null,
        parentKitId: assemblyGroup.parentKitId ?? null,
        quantidade: 1,
        proximoEvento: tipoProximoEvento,
      };

      if (assemblyGroup.pecasNecessarias && Array.isArray(assemblyGroup.pecasNecessarias) && assemblyGroup.pecasNecessarias.length > 0) {
        payload.pecasNecessarias = assemblyGroup.pecasNecessarias.map((peca) => ({
          pecaId: peca.pecaId,
          nome: peca.nome ?? '',
          quantidade: peca.quantidade,
          quantidadeAtendida: peca.quantidadeAtendida,
          atendimentoDetalhado: peca.atendimentoDetalhado ?? [],
        }));
      }

      await addDoc(collection(db, 'lancamentosProducao'), cleanObject({
        tipoEvento: 'conclusao_montagem_modelo',
        timestamp: serverTimestamp(),
        usuarioId: auth.currentUser.uid,
        payload: payload,
      }));
      
      toast.success("Montagem de modelo concluída com sucesso!");
    } catch (error) {
      console.error("Erro ao concluir montagem de modelo:", error);
      toast.error("Ocorreu um erro ao concluir a montagem. Verifique o console para mais detalhes.");
    }
  }, []);

  const handleLaunchPackagingTime = useCallback(async (pedidoId: string, time: number) => {
    if (!time || time <= 0) {
      toast.error("Por favor, insira um tempo de embalagem válido.");
      return;
    }

    try {
      await addDoc(collection(db, 'lancamentosServicos'), cleanObject({
        serviceType: 'embalagem',
        origem: 'pedido',
        usuario: auth.currentUser?.displayName || 'Sistema',
        data: Timestamp.now(),
        payload: {
          total: time,
          pedidoId: pedidoId
        }
      } as LancamentoServico));
      toast.success("Tempo de embalagem lançado com sucesso!");
    } catch (error) {
      console.error("Erro ao lançar tempo de embalagem:", error);
      toast.error("Falha ao lançar o tempo de embalagem.");
    }
  }, []);

  const concludePedido = useCallback(async (pedidoId: string, selectedPackagingInsumos: Record<string, { insumo: any; quantidade: number }[]>) => {
    try {
      const batch = writeBatch(db);
      const pedidoRef = doc(db, 'pedidos', pedidoId);

      // Lançar insumos de embalagem
      const insumosParaLancar = selectedPackagingInsumos[pedidoId] ?? [];
      for (const { insumo, quantidade } of insumosParaLancar) {
        const lancamentoRef = doc(collection(db, 'lancamentosInsumos'));
        batch.set(lancamentoRef, {
          id: uuidv4(),
          insumoId: insumo.id,
          tipoInsumo: 'material',
          tipoMovimento: 'saida',
          quantidade: quantidade,
          unidadeMedida: 'unidades',
          detalhes: `Consumo de embalagem para Pedido #${pedidoId}`,
          data: Timestamp.now(),
        });
      }

      // Atualizar status do pedido
      batch.update(pedidoRef, {
        status: 'concluido',
        dataConclusao: Timestamp.now(),
      });

      await batch.commit();
      toast.success("Pedido finalizado com sucesso!");
    } catch (error) {
      console.error("Erro ao finalizar o pedido: ", error);
      toast.error("Ocorreu um erro ao tentar finalizar o pedido. Verifique o console para mais detalhes.");
    }
  }, []);

  return {
    updateProductionGroupStatus,
    revertProductionGroupStatus,
    handleStartOptimizedProduction,
    handleConcludeProduction,
    handleStockSelection,
    handleConcluirMontagemPeca,
    handleConcluirMontagemModelo,
    handleLaunchPackagingTime,
    concludePedido,
  };
};

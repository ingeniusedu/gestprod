import { useState, useCallback } from 'react';
import { SummaryItem, Pedido, AllProductsData, OptimizedGroup } from '../types';
import { useStockCalculations } from './useStockCalculations';

export const useProductionSummary = ({
  pedidos,
  allProducts,
  optimizedGroups
}: {
  pedidos: Pedido[];
  allProducts: AllProductsData;
  optimizedGroups: Map<string, OptimizedGroup>;
}) => {
  const [productionSummary, setProductionSummary] = useState<SummaryItem[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const { getStockForProduct } = useStockCalculations();

  const generateProductionSummary = useCallback(async () => {
    setIsSummaryLoading(true);

    const summaryItemsMap = new Map<string, SummaryItem>();

    // Helper to get or create a SummaryItem
    const getOrCreateSummaryItem = (
      documentId: string,
      productSku: string,
      name: string,
      type: SummaryItem['tipo'],
      level: number
    ): SummaryItem => {
      const key = `${type}-${documentId}`;
      if (!summaryItemsMap.has(key)) {
        const { estoqueTotal } = getStockForProduct(
          documentId, type, allProducts.pecas, allProducts.partes, allProducts.insumos,
          allProducts.modelos, allProducts.kits, allProducts.filamentGroups,
          allProducts.locaisProdutos, allProducts.locaisInsumos, allProducts.recipientes
        );
        summaryItemsMap.set(key, {
          documentId: documentId,
          sku: productSku,
          produtoNome: name,
          tipo: type,
          emEstoque: estoqueTotal,
          necessario: 0,
          aguardando: 0,
          emProducao: 0,
          emMontagemPeca: 0,
          emMontagemModelo: 0,
          emMontagemKit: 0,
          processandoEmbalagem: 0,
          finalizado: 0,
          children: [],
          level: level,
        });
      }
      return summaryItemsMap.get(key)!;
    };

    // Process all pedidos to build the hierarchical structure and calculate 'necessario'
    pedidos.filter(p => p.status !== 'concluido' && p.status !== 'cancelado').forEach(pedido => {
      pedido.produtos.forEach(pedidoProduto => {
        let topLevelItem: SummaryItem | undefined;

        if (pedidoProduto.tipo === 'kit') {
          topLevelItem = getOrCreateSummaryItem(pedidoProduto.produtoId, pedidoProduto.skuProduto, pedidoProduto.nomeProduto, 'kit', 0);
          topLevelItem.necessario += pedidoProduto.quantidade;

          pedidoProduto.modelosComponentes?.forEach(modeloComponente => {
            const modeloItem = getOrCreateSummaryItem(modeloComponente.produtoId, modeloComponente.skuProduto, modeloComponente.nomeProduto, 'modelo', 1);
            modeloItem.necessario += pedidoProduto.quantidade * modeloComponente.quantidade;
            if (!topLevelItem?.children?.some(c => c.documentId === modeloItem.documentId)) {
              topLevelItem?.children?.push(modeloItem);
            }

            modeloComponente.pecasComponentes?.forEach(pecaComponente => {
              const pecaItem = getOrCreateSummaryItem(pecaComponente.SKU, pecaComponente.SKU, pecaComponente.nome, 'peca', 2);
              pecaItem.necessario += pedidoProduto.quantidade * modeloComponente.quantidade * pecaComponente.quantidade;
              if (!modeloItem?.children?.some(c => c.documentId === pecaItem.documentId)) {
                modeloItem?.children?.push(pecaItem);
              }

              pecaComponente.gruposImpressao?.forEach(grupoImpressao => {
                grupoImpressao.partes?.forEach(parteRef => {
                  const parteItem = getOrCreateSummaryItem(parteRef.parteId, parteRef.sku, parteRef.nome, 'parte', 3);
                  parteItem.necessario += pedidoProduto.quantidade * modeloComponente.quantidade * pecaComponente.quantidade * parteRef.quantidade;
                  if (!pecaItem?.children?.some(c => c.documentId === parteItem.documentId)) {
                    pecaItem?.children?.push(parteItem);
                  }
                });
              });
            });
          });
        } else if (pedidoProduto.tipo === 'modelo') {
          topLevelItem = getOrCreateSummaryItem(pedidoProduto.produtoId, pedidoProduto.skuProduto, pedidoProduto.nomeProduto, 'modelo', 0);
          topLevelItem.necessario += pedidoProduto.quantidade;

          pedidoProduto.pecasComponentes?.forEach(pecaComponente => {
            const pecaItem = getOrCreateSummaryItem(pecaComponente.SKU, pecaComponente.SKU, pecaComponente.nome, 'peca', 1);
            pecaItem.necessario += pedidoProduto.quantidade * pecaComponente.quantidade;
            if (!topLevelItem?.children?.some(c => c.documentId === pecaItem.documentId)) {
              topLevelItem?.children?.push(pecaItem);
            }

            pecaComponente.gruposImpressao?.forEach(grupoImpressao => {
              grupoImpressao.partes?.forEach(parteRef => {
                const parteItem = getOrCreateSummaryItem(parteRef.parteId, parteRef.sku, parteRef.nome, 'parte', 2);
                parteItem.necessario += pedidoProduto.quantidade * pecaComponente.quantidade * parteRef.quantidade;
                if (!pecaItem?.children?.some(c => c.documentId === parteItem.documentId)) {
                  pecaItem?.children?.push(parteItem);
                }
              });
            });
          });
        } else if (pedidoProduto.tipo === 'peca') {
          topLevelItem = getOrCreateSummaryItem(pedidoProduto.produtoId, pedidoProduto.skuProduto, pedidoProduto.nomeProduto, 'peca', 0);
          topLevelItem.necessario += pedidoProduto.quantidade;

          pedidoProduto.gruposImpressao?.forEach(grupoImpressao => {
            grupoImpressao.partes?.forEach(parteRef => {
              const parteItem = getOrCreateSummaryItem(parteRef.parteId, parteRef.sku, parteRef.nome, 'parte', 1);
              parteItem.necessario += pedidoProduto.quantidade * parteRef.quantidade;
              if (!topLevelItem?.children?.some(c => c.documentId === parteItem.documentId)) {
                topLevelItem?.children?.push(parteItem);
              }
            });
          });
        }
      });
    });

    // Function to recursively calculate status
    const calculateStatus = (item: SummaryItem) => {
      item.aguardando = 0;
      item.emProducao = 0;
      item.emMontagemPeca = 0;
      item.emMontagemModelo = 0;
      item.emMontagemKit = 0;
      item.processandoEmbalagem = 0;
      item.finalizado = 0;

      if (Array.isArray(item.children) && item.children.length > 0) {
        item.children.forEach(child => calculateStatus(child));

        // Aggregate from children
        const totalChildNecessario = item.children.reduce((sum, child) => sum + child.necessario, 0);
        if (totalChildNecessario > 0) {
          item.aguardando = item.children.reduce((sum, child) => sum + child.aguardando, 0);
          item.emProducao = item.children.reduce((sum, child) => sum + child.emProducao, 0);
          item.emMontagemPeca = item.children.reduce((sum, child) => sum + child.emMontagemPeca, 0);
          item.emMontagemModelo = item.children.reduce((sum, child) => sum + child.emMontagemModelo, 0);
          item.emMontagemKit = item.children.reduce((sum, child) => sum + child.emMontagemKit, 0);
          item.processandoEmbalagem = item.children.reduce((sum, child) => sum + child.processandoEmbalagem, 0);
          item.finalizado = item.children.reduce((sum, child) => sum + child.finalizado, 0);
        }
      } else {
        // Base case: Partes or items without children
        optimizedGroups.forEach(group => {
          if (item.tipo === 'parte' && group.partesNoGrupo && item.documentId) {
            const parteInfo = group.partesNoGrupo[item.documentId];
            if (parteInfo) {
              if (group.status === 'aguardando') item.aguardando += parteInfo.quantidade;
              else if (group.status === 'em_producao') item.emProducao += parteInfo.quantidade;
            }
          }
        });

        // For pecas, modelos, kits, check assembly groups
        allProducts.assemblyGroups.forEach(ag => {
          if (item.documentId && ag.targetProductId) {
            if (ag.targetProductType === 'peca' && item.tipo === 'peca' && ag.targetProductId === item.documentId) {
              if (ag.status === 'aguardando_montagem' || ag.status === 'em_montagem') item.emMontagemPeca += ag.payload?.quantidade || 0;
              else if (ag.status === 'montado') item.emMontagemModelo += ag.payload?.quantidade || 0;
            } else if (ag.targetProductType === 'modelo' && item.tipo === 'modelo' && ag.targetProductId === item.documentId) {
              if (ag.status === 'aguardando_montagem' || ag.status === 'em_montagem') item.emMontagemModelo += ag.payload?.quantidade || 0;
              else if (ag.status === 'montado') item.emMontagemKit += ag.payload?.quantidade || 0;
            } else if (ag.targetProductType === 'kit' && item.tipo === 'kit' && ag.targetProductId === item.documentId) {
              if (ag.status === 'aguardando_montagem' || ag.status === 'em_montagem') item.emMontagemKit += ag.payload?.quantidade || 0;
              else if (ag.status === 'montado') item.processandoEmbalagem += ag.payload?.quantidade || 0;
            } else if (ag.targetProductType === 'produto_final' && (item.tipo === 'kit' || item.tipo === 'modelo' || item.tipo === 'peca') && ag.targetProductId === item.documentId) {
              if (ag.status === 'produzido_aguardando_embalagem') item.processandoEmbalagem += ag.payload?.quantidade || 0;
              else if (ag.status === 'embalado') item.finalizado += ag.payload?.quantidade || 0;
            }
          }
        });
      }
    };

    // Get all top-level items (kits, models, pecas that are not children)
    const topLevelSummaryItems: SummaryItem[] = [];
    summaryItemsMap.forEach(item => {
      let isChild = false;
      summaryItemsMap.forEach(potentialParent => {
        if (potentialParent.children?.some(child => child.documentId === item.documentId && child.tipo === item.tipo)) {
          isChild = true;
        }
      });
      if (!isChild && item.necessario > 0) {
        topLevelSummaryItems.push(item);
      }
    });

    // Sort top-level items by type (kits first, then models, then pecas) and then by name
    topLevelSummaryItems.sort((a, b) => {
      const typeOrder: { [key: string]: number } = { 'kit': 0, 'modelo': 1, 'peca': 2, 'parte': 3 };
      if (typeOrder[a.tipo] !== typeOrder[b.tipo]) {
        return typeOrder[a.tipo] - typeOrder[b.tipo];
      }
      return a.produtoNome.localeCompare(b.produtoNome);
    });

    // Recursively sort children
    const sortChildren = (items: SummaryItem[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          item.children.sort((a, b) => {
            const typeOrder: { [key: string]: number } = { 'kit': 0, 'modelo': 1, 'peca': 2, 'parte': 3 };
            if (typeOrder[a.tipo] !== typeOrder[b.tipo]) {
              return typeOrder[a.tipo] - typeOrder[b.tipo];
            }
            return a.produtoNome.localeCompare(b.produtoNome);
          });
          sortChildren(item.children);
        }
      });
    };
    sortChildren(topLevelSummaryItems);

    // Calculate status for all items, starting from the top
    topLevelSummaryItems.forEach(item => calculateStatus(item));

    setProductionSummary(topLevelSummaryItems.filter(item => item.necessario > 0));
    setIsSummaryLoading(false);
  }, [pedidos, allProducts, optimizedGroups, getStockForProduct]);

  return {
    productionSummary,
    isSummaryLoading,
    generateProductionSummary
  };
};

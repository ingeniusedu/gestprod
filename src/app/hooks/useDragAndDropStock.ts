import { useState, useCallback, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Pedido, Peca, Modelo, Kit } from '../types';

interface StockItem {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca';
  quantidade: number;
  produtoId: string;
}

interface OrderHierarchyItem {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca';
  quantidadeNecessaria: number;
  quantidadeAtendida: number;
  assemblyInstanceId?: string;
  children?: OrderHierarchyItem[];
  parentId?: string;
}

export const useDragAndDropStock = () => {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [orderHierarchy, setOrderHierarchy] = useState<OrderHierarchyItem[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [availablePecas, setAvailablePecas] = useState<Peca[]>([]);
  const [availableModels, setAvailableModels] = useState<Modelo[]>([]);
  const [availableKits, setAvailableKits] = useState<Kit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Buscar dados do Firestore
  useEffect(() => {
    const unsubscribePedidos = onSnapshot(collection(db, 'pedidos'), (snapshot) => {
      setPedidos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pedido)));
    });

    const unsubscribePecas = onSnapshot(collection(db, 'pecas'), (snapshot) => {
      setAvailablePecas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Peca)));
    });

    const unsubscribeModelos = onSnapshot(collection(db, 'modelos'), (snapshot) => {
      setAvailableModels(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Modelo)));
    });

    const unsubscribeKits = onSnapshot(collection(db, 'kits'), (snapshot) => {
      setAvailableKits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit)));
    });

    return () => {
      unsubscribePedidos();
      unsubscribePecas();
      unsubscribeModelos();
      unsubscribeKits();
    };
  }, []);

  // Processar estoque disponível
  useEffect(() => {
    if (!availablePecas.length || !availableModels.length || !availableKits.length) return;

    const processStock = () => {
      const stock: StockItem[] = [];

      // Processar kits em estoque
      availableKits.forEach(kit => {
        const estoque = kit.estoqueTotal || (kit.posicoesEstoque?.reduce((sum, pos) => sum + pos.quantidade, 0) || 0);
        if (estoque > 0) {
          stock.push({
            id: kit.id,
            nome: kit.nome,
            tipo: 'kit',
            quantidade: estoque,
            produtoId: kit.id
          });
        }
      });

      // Processar modelos em estoque
      availableModels.forEach(modelo => {
        const estoque = modelo.estoqueTotal || (modelo.posicoesEstoque?.reduce((sum, pos) => sum + pos.quantidade, 0) || 0);
        if (estoque > 0) {
          stock.push({
            id: modelo.id,
            nome: modelo.nome,
            tipo: 'modelo',
            quantidade: estoque,
            produtoId: modelo.id
          });
        }
      });

      // Processar peças em estoque
      availablePecas.forEach(peca => {
        const estoque = peca.estoqueTotal || (peca.posicoesEstoque?.reduce((sum, pos) => sum + pos.quantidade, 0) || 0);
        if (estoque > 0) {
          stock.push({
            id: peca.id,
            nome: peca.nome,
            tipo: 'peca',
            quantidade: estoque,
            produtoId: peca.id
          });
        }
      });

      setStockItems(stock);
    };

    processStock();
  }, [availablePecas, availableModels, availableKits]);

  // Processar hierarquia dos pedidos
  useEffect(() => {
    if (!pedidos.length) return;

    const processOrderHierarchy = () => {
      const hierarchy: OrderHierarchyItem[] = [];

      pedidos.forEach(pedido => {
        if (pedido.status !== 'concluido') {
          pedido.produtos.forEach(produto => {
            const item: OrderHierarchyItem = {
              id: `${pedido.id}-${produto.produtoId}`,
              nome: produto.nomeProduto || `Produto ${produto.produtoId}`,
              tipo: produto.tipo as 'kit' | 'modelo' | 'peca',
              quantidadeNecessaria: produto.quantidade,
              quantidadeAtendida: 0, // TODO: Buscar de atendimentoEstoqueDetalhado
              assemblyInstanceId: undefined // TODO: Buscar de assemblyInstanceId se existir
            };

            // Adicionar filhos baseado no tipo
            if (produto.tipo === 'kit' && produto.modelosComponentes) {
              item.children = produto.modelosComponentes.map(modelo => ({
                id: `${pedido.id}-${produto.produtoId}-${modelo.produtoId}`,
                nome: modelo.nomeProduto || `Modelo ${modelo.produtoId}`,
                tipo: 'modelo' as const,
                quantidadeNecessaria: modelo.quantidade,
                quantidadeAtendida: 0,
                parentId: item.id,
                children: modelo.pecasComponentes?.map(peca => ({
                  id: `${pedido.id}-${produto.produtoId}-${modelo.produtoId}-${peca.id}`,
                  nome: peca.nome || `Peça ${peca.id}`,
                  tipo: 'peca' as const,
                  quantidadeNecessaria: peca.quantidade,
                  quantidadeAtendida: 0,
                  parentId: `${pedido.id}-${produto.produtoId}-${modelo.produtoId}`
                }))
              }));
            } else if (produto.tipo === 'modelo' && produto.pecasComponentes) {
              item.children = produto.pecasComponentes.map(peca => ({
                id: `${pedido.id}-${produto.produtoId}-${peca.id}`,
                nome: peca.nome || `Peça ${peca.id}`,
                tipo: 'peca' as const,
                quantidadeNecessaria: peca.quantidade,
                quantidadeAtendida: 0,
                parentId: item.id
              }));
            }

            hierarchy.push(item);
          });
        }
      });

      setOrderHierarchy(hierarchy);
      setIsLoading(false);
    };

    processOrderHierarchy();
  }, [pedidos]);

  // Função para extrair o ID real de um ID formatado
  const extrairIdReal = (idFormatado: string): string => {
    // Remove prefixos como 'peca_', 'modelo_', 'kit_', 'parte_'
    const idSemPrefixo = idFormatado.replace(/^(peca_|modelo_|kit_|parte_)/, '');
    
    // Remove sufixos como '_kitdirect', '_modelo_xxx'
    // Primeiro tenta remover '_kitdirect'
    let idSemSufixo = idSemPrefixo.replace(/_kitdirect$/, '');
    // Depois tenta remover '_modelo_xxx' (onde xxx é qualquer coisa)
    idSemSufixo = idSemSufixo.replace(/_(modelo_[^_]+)$/, '');
    // Remove qualquer coisa após o primeiro '_' se ainda houver
    idSemSufixo = idSemSufixo.split('_')[0];
    
    return idSemSufixo;
  };

  // Validar se o estoque é compatível com o nó alvo
  const validateStockCompatibility = (
    stockItem: StockItem,
    targetItem: OrderHierarchyItem
  ): { isValid: boolean; message: string } => {
    // Verificar se os tipos são compatíveis
    if (stockItem.tipo !== targetItem.tipo) {
      return { 
        isValid: false, 
        message: `Tipo incompatível: Estoque é ${stockItem.tipo}, mas o alvo é ${targetItem.tipo}` 
      };
    }

    // Verificar se os IDs são iguais (mesmo produto) - usando extrairIdReal para lidar com IDs formatados
    const idRealTarget = extrairIdReal(targetItem.id);
    
    if (stockItem.produtoId !== idRealTarget) {
      return { 
        isValid: false, 
        message: `Produto diferente: Estoque é ${stockItem.nome} (ID: ${stockItem.produtoId}), mas o alvo é ${targetItem.nome} (ID real: ${idRealTarget}, ID formatado: ${targetItem.id})` 
      };
    }

    // Verificar se há quantidade disponível
    if (stockItem.quantidade <= 0) {
      return { 
        isValid: false, 
        message: `Estoque insuficiente: ${stockItem.nome} tem 0 unidades disponíveis` 
      };
    }

    // Verificar se o nó ainda precisa de atendimento
    const quantidadeNecessaria = targetItem.quantidadeNecessaria - targetItem.quantidadeAtendida;
    if (quantidadeNecessaria <= 0) {
      return { 
        isValid: false, 
        message: `Nó já totalmente atendido: ${targetItem.nome} já tem ${targetItem.quantidadeAtendida}/${targetItem.quantidadeNecessaria} unidades` 
      };
    }

    return { isValid: true, message: 'Compatível' };
  };

  const handleDrop = useCallback(async (
    stockItem: StockItem,
    targetItem: OrderHierarchyItem
  ) => {
    console.log('Drop realizado:', { stockItem, targetItem });
    
    // Validar compatibilidade
    const validation = validateStockCompatibility(stockItem, targetItem);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }
    
    // TODO: Implementar lógica de cascata
    // 1. Identificar scope baseado no tipo
    // 2. Chamar handleUsoEstoque para cada assemblyInstanceId no scope
    // 3. Atualizar estado local
    
    return Promise.resolve();
  }, []);

  const calculateCascadeScope = useCallback((
    stockItem: StockItem,
    targetItem: OrderHierarchyItem
  ): OrderHierarchyItem[] => {
    const scope: OrderHierarchyItem[] = [targetItem];

    if (stockItem.tipo === 'kit' && targetItem.tipo === 'kit') {
      // Kit em Kit: inclui todos os filhos
      const collectChildren = (item: OrderHierarchyItem) => {
        if (item.children) {
          item.children.forEach(child => {
            scope.push(child);
            collectChildren(child);
          });
        }
      };
      collectChildren(targetItem);
    } else if (stockItem.tipo === 'modelo' && targetItem.tipo === 'modelo') {
      // Modelo em Modelo: inclui apenas peças do modelo
      if (targetItem.children) {
        targetItem.children.forEach(child => {
          if (child.tipo === 'peca') {
            scope.push(child);
          }
        });
      }
    }
    // Peça em Peça: apenas a peça específica (já incluída)

    return scope;
  }, []);

  return {
    stockItems,
    orderHierarchy,
    isLoading,
    handleDrop,
    calculateCascadeScope
  };
};

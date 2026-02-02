import { useState, useCallback, useEffect, useMemo } from 'react';
import { db } from '../services/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Pedido, 
  Peca, 
  Modelo, 
  Kit, 
  GrupoMontagem,
  ProductionGroup,
  UsoEstoquePayload
} from '../types';

interface StockItem {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca' | 'parte';
  quantidade: number;
  produtoId: string;
  posicoesEstoque?: any[];
}

export interface ProductHierarchyNode {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca' | 'parte';
  quantidadeNecessaria: number;
  quantidadeAtendida: number;
  estoqueAtual?: number;
  nivel: number;
  parentId?: string;
  children?: ProductHierarchyNode[];
  
  grupoProducaoId?: string;
  grupoMontagemId?: string;
  assemblyInstanceId?: string;
  
  pedidoId?: string;
  parentModeloId?: string;
  parentKitId?: string;
  targetProductId?: string;
  
  atendimentoDetalhado?: Array<{
    origem: string;
    quantidade: number;
    timestamp: any;
  }>;
  
  atendimentoViaCascata?: Array<{
    origemId: string; 
    origemNome: string; 
    origemTipo: 'kit' | 'modelo';
    quantidade: number; 
    operationId?: string; 
  }>;
  
  temGrupoMontagem?: boolean;
  temGrupoProducao?: boolean;
  dadosCompletos?: boolean;
  
  gruposProducao?: ProductionGroup[];
  gruposMontagem?: GrupoMontagem[];
  assemblyInstanceIds?: Array<{
    tipo: string;
    id: string;
    instance: number;
    assemblyInstanceId: string;
  }>;
  
  jornadaIds?: {
    gruposMontagem: string[];
    gruposProducao: string[];
  };
  
  // Novos campos para rastreamento de atendimento
  estaAtendido?: boolean;
  quantidadeJaAtendida?: number;
  origemAtendimento?: string[];
  percentualAtendido?: number;
  statusAtendimento?: 'nao_atendido' | 'parcialmente_atendido' | 'totalmente_atendido';
}

interface PedidoComHierarquia {
  pedido: Pedido;
  hierarquia: ProductHierarchyNode[];
  gruposProducao: ProductionGroup[];
  gruposMontagem: GrupoMontagem[];
  needsRefresh?: boolean;
}

export interface PendingOperation {
  id: string;
  stockItem: StockItem;
  targetNode: ProductHierarchyNode;
  quantity: number;
  cascadeScope: ProductHierarchyNode[];
  timestamp: Date;
  pedidoId: string;
}

interface UseDragAndDropStockV3Options {
  showAllStatuses?: boolean;
}

export const useDragAndDropStockV3 = (options: UseDragAndDropStockV3Options = {}) => {
  const { showAllStatuses = false } = options;
  const [pedidosIniciais, setPedidosIniciais] = useState<Pedido[]>([]);
  const [hierarquiaCache, setHierarquiaCache] = useState<Record<string, PedidoComHierarquia>>({});
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);

  const [pendingOpsMap, setPendingOpsMap] = useState<Record<string, {
    total: number;
    ops: PendingOperation[];
  }>>({});

  const parseAssemblyInstanceId = useCallback((assemblyInstanceId: string) => {
    const parts = assemblyInstanceId.split('-');
    const result = {
      pedidoId: parts[0],
      kitId: undefined as string | undefined,
      modeloId: undefined as string | undefined,
      pecaId: undefined as string | undefined,
      instanceNumber: 1,
      isDirectKitPiece: false,
      isModelPiece: false,
      journey: [] as Array<{ tipo: string; id: string; instance: number }>
    };
    
    let i = 0;
    let journeyIndex = 0;
    
    while (i < parts.length) {
      let productId = '';
      let instance = 1;
      while (i < parts.length) {
        const part = parts[i];
        const parsedNumber = parseInt(part);
        if (!isNaN(parsedNumber)) {
          instance = parsedNumber;
          i++;
          break;
        } else {
          productId = productId ? productId + '-' + part : part;
          i++;
        }
      }
      
      let tipo = 'produto';
      if (journeyIndex === 0) tipo = 'pedido';
      else if (journeyIndex === 1) tipo = parts.length > 3 ? 'kit' : 'modelo';
      else if (journeyIndex === 2) tipo = 'modelo';
      else if (journeyIndex >= 3) tipo = 'peca';
      
      if (productId.includes('embalagem')) tipo = 'kit';
      
      const lastDashIndex = productId.lastIndexOf('-');
      if (lastDashIndex !== -1) {
        const lastPart = productId.substring(lastDashIndex + 1);
        const parsedLastPart = parseInt(lastPart);
        if (!isNaN(parsedLastPart)) {
          productId = productId.substring(0, lastDashIndex);
          instance = parsedLastPart;
        }
      }
      result.journey.push({ tipo, id: productId, instance });
      journeyIndex++;
    }
    
    if (result.journey.length >= 3) {
      result.kitId = result.journey[1].id;
      result.pecaId = result.journey[result.journey.length - 1].id;
      result.isDirectKitPiece = result.journey.length === 3;
      if (result.journey.length === 4) {
        result.modeloId = result.journey[2].id;
        result.isModelPiece = true;
      }
    } else if (result.journey.length === 2) {
      result.modeloId = result.journey[1].id;
      result.pecaId = result.journey[1].id;
      result.isModelPiece = true;
    }
    const lastJourney = result.journey[result.journey.length - 1];
    if (lastJourney) result.instanceNumber = lastJourney.instance;
    return result;
  }, []);

  const fetchGruposMontagemParaPedido = useCallback(async (pedidoId: string): Promise<GrupoMontagem[]> => {
    const q = query(collection(db, 'gruposMontagem'), where('pedidoId', '==', pedidoId));
    const snapshot = await new Promise(resolve => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        unsubscribe();
        resolve(snapshot);
      });
    });
    return (snapshot as any).docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as GrupoMontagem));
  }, []);

  const fetchGruposProducaoParaPedido = useCallback(async (pedidoId: string): Promise<ProductionGroup[]> => {
    // Fetch ALL production groups (not just for this pedidoId) since groups can serve multiple orders
    const q = query(collection(db, 'gruposProducaoOtimizados'));
    const snapshot = await new Promise(resolve => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        unsubscribe();
        resolve(snapshot);
      });
    });
    const groups = (snapshot as any).docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as ProductionGroup));
    
    // Log detalhado para debug
    console.log('DEBUG [fetchGruposProducaoParaPedido]:');
    console.log('  - Total groups found:', groups.length);
    console.log('  - Pedido ID:', pedidoId);
    
    // Log alguns grupos como exemplo
    if (groups.length > 0) {
      console.log('  - Sample groups (first 3):');
      groups.slice(0, 3).forEach((g: ProductionGroup, i: number) => {
        console.log(`    [${i}] ID: ${g.id}, Source: ${g.sourceId} (${g.sourceType})`);
        console.log(`        Partes: ${Object.keys(g.partesNoGrupo || {}).length}`);
        if (g.pedidosOrigem) {
          console.log(`        Pedidos origem: ${g.pedidosOrigem.length}`);
          g.pedidosOrigem.forEach((po: any, idx: number) => {
            console.log(`          [${idx}] Pedido: ${po.pedidoId}, AssemblyInstances: ${po.assemblyInstances?.length || 0}`);
          });
        }
      });
    }
    
    return groups;
  }, []);

  const calcularQuantidadeAtendida = useCallback((grupo: GrupoMontagem): number => {
    if (grupo.pecasNecessarias) {
      return grupo.pecasNecessarias.reduce((sum, peca) => {
        const totalAtendido = (peca as any).atendimentoDetalhado?.reduce(
          (atendSum: number, item: any) => atendSum + item.quantidade, 0
        ) || 0;
        return sum + totalAtendido;
      }, 0);
    } else if (grupo.modelosNecessarios) {
      return grupo.modelosNecessarios.reduce((sum, modelo) => {
        const totalAtendido = (modelo as any).atendimentoDetalhado?.reduce(
          (atendSum: number, item: any) => atendSum + item.quantidade, 0
        ) || 0;
        return sum + totalAtendido;
      }, 0);
    } else if (grupo.produtosFinaisNecessarios) {
      return grupo.produtosFinaisNecessarios.reduce((sum, produto) => {
        const totalAtendido = (produto as any).atendimentoDetalhado?.reduce(
          (atendSum: number, item: any) => atendSum + item.quantidade, 0
        ) || 0;
        return sum + totalAtendido;
      }, 0);
    }
    return 0;
  }, []);

  const extrairAtendimentoDetalhado = useCallback((grupo: GrupoMontagem): Array<{ origem: string; quantidade: number; timestamp: any }> => {
    const atendimentos: Array<{ origem: string; quantidade: number; timestamp: any }> = [];
    if (grupo.pecasNecessarias) {
      grupo.pecasNecessarias.forEach(peca => {
        if ((peca as any).atendimentoDetalhado) atendimentos.push(...(peca as any).atendimentoDetalhado);
      });
    }
    if (grupo.modelosNecessarios) {
      grupo.modelosNecessarios.forEach(modelo => {
        if ((modelo as any).atendimentoDetalhado) atendimentos.push(...(modelo as any).atendimentoDetalhado);
      });
    }
    if (grupo.produtosFinaisNecessarios) {
      grupo.produtosFinaisNecessarios.forEach(produto => {
        if ((produto as any).atendimentoDetalhado) atendimentos.push(...(produto as any).atendimentoDetalhado);
      });
    }
    return atendimentos;
  }, []);

  // Função para filtrar grupos por status
  const filtrarGruposPorStatus = useCallback((
    gruposMontagem: GrupoMontagem[],
    gruposProducao: ProductionGroup[]
  ): {
    gruposMontagemFiltrados: GrupoMontagem[];
    gruposProducaoFiltrados: ProductionGroup[];
  } => {
    // Status que permitem atendimento por estoque
    const statusPermitidos = ['aguardando', 'aguardando_montagem', 'pendente', 'pendente_montagem'];
    
    // Filtrar grupos de montagem
    const gruposMontagemFiltrados = gruposMontagem.filter(grupo => {
      // Verificar status principal do grupo
      if (grupo.status && !statusPermitidos.includes(grupo.status)) {
        return false;
      }
      
      // Verificar se tem assemblyInstanceId (só grupos com assemblyInstanceId podem ser atendidos)
      if (!grupo.assemblyInstanceId) {
        return false;
      }
      
      // Verificar se não é produto final
      if (grupo.targetProductType === 'produto_final') {
        return false;
      }
      
      return true;
    });
    
    // Filtrar grupos de produção
    const gruposProducaoFiltrados = gruposProducao.filter(grupo => {
      // Verificar status principal do grupo
      if (grupo.status && !statusPermitidos.includes(grupo.status)) {
        return false;
      }
      
      // Verificar se tem pedidosOrigem com assemblyInstances
      if (!grupo.pedidosOrigem || grupo.pedidosOrigem.length === 0) {
        return false;
      }
      
      return true;
    });
    
    console.log('DEBUG [filtrarGruposPorStatus]:');
    console.log('  - Grupos montagem originais:', gruposMontagem.length);
    console.log('  - Grupos montagem filtrados:', gruposMontagemFiltrados.length);
    console.log('  - Grupos produção originais:', gruposProducao.length);
    console.log('  - Grupos produção filtrados:', gruposProducaoFiltrados.length);
    
    return {
      gruposMontagemFiltrados,
      gruposProducaoFiltrados
    };
  }, []);

  const buildHierarchyFromAssemblyGroups = useCallback((
    gruposMontagem: GrupoMontagem[],
    pedido: Pedido
  ): ProductHierarchyNode[] => {
    if (!gruposMontagem || gruposMontagem.length === 0) return [];
    const nodeMap = new Map<string, ProductHierarchyNode>();
    
    // Helper function to infer target product type from parsed assemblyInstanceId
    const inferTargetTypeFromParsed = (parsed: any): 'peca' | 'modelo' | 'kit' => {
      if (parsed.pecaId) return 'peca';
      if (parsed.modeloId && !parsed.kitId) return 'modelo';
      if (parsed.kitId) return 'kit';
      return 'peca'; // default
    };
    
    // Helper function to extract context from parsed assemblyInstanceId
    const extractContextFromParsed = (parsed: any) => {
      return {
        tipo: inferTargetTypeFromParsed(parsed),
        targetId: parsed.pecaId || parsed.modeloId || parsed.kitId,
        parentModeloId: parsed.modeloId,
        parentKitId: parsed.kitId,
        pedidoId: parsed.pedidoId
      };
    };
    
    // Simple parser for assemblyInstanceId structure
    const parseSimpleAssemblyInstanceId = (assemblyInstanceId: string) => {
      const parts = assemblyInstanceId.split('-');
      return {
        pedidoId: parts[0],
        kitId: parts.length > 2 ? parts[1] : undefined,
        modeloId: parts.length > 3 ? parts[2] : (parts.length > 1 ? parts[1] : undefined),
        pecaId: parts[parts.length - 2], // Second to last part
        pecaInstance: parseInt(parts[parts.length - 1]) || 1
      };
    };
    
    // Create nodes from assembly groups
    gruposMontagem.forEach(grupo => {
      if (!grupo.assemblyInstanceId) return;
      
      // Parse assemblyInstanceId to extract structure
      const parsed = parseSimpleAssemblyInstanceId(grupo.assemblyInstanceId);
      if (!parsed) return;
      
      // Extract hierarchical context
      const context = extractContextFromParsed(parsed);
      
      // Verificar status de atendimento
      const statusAtendimento = verificarStatusAtendimento(
        {
          id: grupo.assemblyInstanceId,
          nome: grupo.targetProductName || `Grupo ${grupo.id}`,
          tipo: context.tipo,
          targetProductId: grupo.targetProductId || context.targetId,
          quantidadeNecessaria: 1,
          quantidadeAtendida: calcularQuantidadeAtendida(grupo),
          nivel: 1,
          parentId: undefined,
          children: [],
          pedidoId: pedido.id,
          parentModeloId: context.parentModeloId,
          parentKitId: context.parentKitId,
          assemblyInstanceId: grupo.assemblyInstanceId,
          temGrupoMontagem: true,
          temGrupoProducao: false,
          dadosCompletos: true,
          atendimentoViaCascata: []
        },
        gruposMontagem,
        pedido.id
      );

      // Create node with all essential fields
      const node: ProductHierarchyNode = {
        id: grupo.assemblyInstanceId,
        nome: grupo.targetProductName || `Grupo ${grupo.id}`,
        tipo: context.tipo,
        targetProductId: grupo.targetProductId || context.targetId,
        
        // Hierarchical context fields
        parentModeloId: context.parentModeloId,
        parentKitId: context.parentKitId,
        
        // Assembly instance ID from the group
        assemblyInstanceId: grupo.assemblyInstanceId,
        
        // Pedido data
        pedidoId: pedido.id,
        quantidadeNecessaria: 1,
        quantidadeAtendida: calcularQuantidadeAtendida(grupo),
        
        // Structure fields
        nivel: 1, // Will be calculated when building parent-child relationships
        parentId: undefined, // Will be calculated when building parent-child relationships
        children: [],
        
        // Metadata
        temGrupoMontagem: true,
        temGrupoProducao: false,
        dadosCompletos: true,
        atendimentoViaCascata: []
      };
      
      nodeMap.set(node.id, node);
    });
    
    // Build parent-child relationships based on assemblyInstanceId structure
    const nodes = Array.from(nodeMap.values());
    const rootNodes: ProductHierarchyNode[] = [];
    
    nodes.forEach(node => {
      if (!node.assemblyInstanceId) return;
      
      const parsed = parseSimpleAssemblyInstanceId(node.assemblyInstanceId);
      if (!parsed) return;
      
      // Find parent based on assemblyInstanceId structure
      let parentId: string | undefined;
      
      // If this is a piece in a modelo, parent is modelo
      if (parsed.modeloId && parsed.pecaId && !parsed.kitId) {
        const parentIdCandidate = `${parsed.pedidoId}-${parsed.modeloId}`;
        const parentNode = nodeMap.get(parentIdCandidate);
        if (parentNode) {
          parentId = parentIdCandidate;
          node.nivel = 3;
        }
      }
      
      // If this is a piece in a kit, parent is kit
      else if (parsed.kitId && parsed.pecaId) {
        const parentIdCandidate = `${parsed.pedidoId}-${parsed.kitId}`;
        const parentNode = nodeMap.get(parentIdCandidate);
        if (parentNode) {
          parentId = parentIdCandidate;
          node.nivel = parsed.modeloId ? 4 : 3;
        }
      }
      
      // If this is a modelo in a kit, parent is kit
      else if (parsed.kitId && parsed.modeloId && !parsed.pecaId) {
        const parentIdCandidate = `${parsed.pedidoId}-${parsed.kitId}`;
        const parentNode = nodeMap.get(parentIdCandidate);
        if (parentNode) {
          parentId = parentIdCandidate;
          node.nivel = 2;
        }
      }
      
      // If no parent found, this is a root node
      if (parentId) {
        node.parentId = parentId;
        const parentNode = nodeMap.get(parentId);
        if (parentNode) {
          if (!parentNode.children) parentNode.children = [];
          parentNode.children.push(node);
        }
      } else {
        node.nivel = 1;
        rootNodes.push(node);
      }
    });
    
    return rootNodes;
  }, [calcularQuantidadeAtendida]);

  const buildHierarchyFromPedido = useCallback((
    pedido: Pedido
  ): ProductHierarchyNode[] => {
    if (!pedido.produtos || pedido.produtos.length === 0) return [];
    const nodeMap = new Map<string, ProductHierarchyNode>();
    
    const criarNo = (
      produtoId: string,
      nome: string,
      tipo: 'kit' | 'modelo' | 'peca' | 'parte',
      quantidade: number,
      nivel: number,
      parentId: string | null = null
    ): ProductHierarchyNode => {
      const nodeId = parentId ? `${parentId}-${produtoId}` : `pedido-${pedido.id}-${produtoId}`;
      const node: ProductHierarchyNode = {
        id: nodeId,
        nome: nome || `Produto ${produtoId}`,
        tipo: tipo,
        quantidadeNecessaria: quantidade,
        quantidadeAtendida: 0,
        nivel,
        parentId: parentId || undefined,
        pedidoId: pedido.id,
        targetProductId: produtoId,
        atendimentoViaCascata: []
      };
      nodeMap.set(nodeId, node);
      return node;
    };


    pedido.produtos.forEach((produto: any) => {
      const produtoNode = criarNo(produto.produtoId || '', produto.nomeProduto || '', produto.tipo, produto.quantidade || 1, 1);
      if (produto.tipo === 'modelo' && produto.pecasComponentes) {
        produto.pecasComponentes.forEach((peca: any) => {
          const pecaNode = criarNo(peca.id || '', peca.nome || '', 'peca', peca.quantidade || 1, 2, produtoNode.id);
          if (peca.gruposImpressao) {
            peca.gruposImpressao.forEach((grupo: any) => {
              if (grupo.partes) {
                grupo.partes.forEach((parte: any) => {
                  criarNo(parte.parteId || '', parte.nome || '', 'parte', parte.quantidade || 1, 3, pecaNode.id);
                });
              }
            });
          }
        });
      } else if (produto.tipo === 'peca' && produto.gruposImpressao) {
        produto.gruposImpressao.forEach((grupo: any) => {
          if (grupo.partes) {
            grupo.partes.forEach((parte: any) => {
              criarNo(parte.parteId || '', parte.nome || '', 'parte', parte.quantidade || 1, 2, produtoNode.id);
            });
          }
        });
      } else if (produto.tipo === 'kit') {
        if (produto.modelosComponentes) {
          produto.modelosComponentes.forEach((modelo: any) => {
            const modeloNode = criarNo(modelo.produtoId || '', modelo.nomeProduto || '', 'modelo', modelo.quantidade || 1, 2, produtoNode.id);
            if (modelo.pecasComponentes) {
              modelo.pecasComponentes.forEach((peca: any) => {
                const pecaNode = criarNo(peca.id || '', peca.nome || '', 'peca', peca.quantidade || 1, 3, modeloNode.id);
                if (peca.gruposImpressao) {
                  peca.gruposImpressao.forEach((grupo: any) => {
                    if (grupo.partes) {
                      grupo.partes.forEach((parte: any) => {
                        criarNo(parte.parteId || '', parte.nome || '', 'parte', parte.quantidade || 1, 4, pecaNode.id);
                      });
                    }
                  });
                }
              });
            }
          });
        }
        if (produto.pecasComponentes) {
          produto.pecasComponentes.forEach((peca: any) => {
            const pecaNode = criarNo(peca.id || '', peca.nome || '', 'peca', peca.quantidade || 1, 2, produtoNode.id);
            if (peca.gruposImpressao) {
              peca.gruposImpressao.forEach((grupo: any) => {
                if (grupo.partes) {
                  grupo.partes.forEach((parte: any) => {
                    criarNo(parte.parteId || '', parte.nome || '', 'parte', parte.quantidade || 1, 3, pecaNode.id);
                  });
                }
              });
            }
          });
        }
      }
    });
    
    for (const node of nodeMap.values()) {
      const children = Array.from(nodeMap.values()).filter(n => n.parentId === node.id);
      if (children.length > 0) node.children = children;
    }
    
    const rootNodes = Array.from(nodeMap.values()).filter(node => !node.parentId);

    
    return rootNodes;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'pedidos'), (snapshot) => {
      const pedidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pedido));
      setPedidosIniciais(pedidos);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedPedidoId) return;
    const pedido = pedidosIniciais.find(p => p.id === selectedPedidoId);
    if (!pedido) return;
    const carregarHierarquia = async () => {
      const [gruposMontagem, gruposProducao] = await Promise.all([
        fetchGruposMontagemParaPedido(pedido.id),
        fetchGruposProducaoParaPedido(pedido.id)
      ]);
      
      let gruposMontagemParaCache = gruposMontagem;
      let gruposProducaoParaCache = gruposProducao;

      if (!showAllStatuses) {
        const { gruposMontagemFiltrados, gruposProducaoFiltrados } = filtrarGruposPorStatus(gruposMontagem, gruposProducao);
        gruposMontagemParaCache = gruposMontagemFiltrados;
        gruposProducaoParaCache = gruposProducaoFiltrados;
      }
      
      const hierarquia: ProductHierarchyNode[] = []; // Será construída dinamicamente no ProductHierarchyTree
      setHierarquiaCache(prev => ({
        ...prev,
        [pedido.id]: { pedido, hierarquia, gruposProducao: gruposProducaoParaCache, gruposMontagem: gruposMontagemParaCache }
      }));
    };
    carregarHierarquia();
  }, [selectedPedidoId, pedidosIniciais]);

  // Listener para lançamentos de produção em tempo real (VERSÃO NÃO-DESTRUTIVA)
  useEffect(() => {
    if (!selectedPedidoId) return;
    
    const q = query(
      collection(db, 'lancamentosProducao'),
      where('tipoEvento', '==', 'uso_estoque'),
      where('payload.pedidoId', '==', selectedPedidoId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const lancamento = change.doc.data();
          console.log('DEBUG: Novo lançamento de uso de estoque detectado (não invalidando cache):', lancamento);
          
          // ✅ NÃO INVALIDAR MAIS O CACHE - Preservar estado de expansão
          // Apenas logar o lançamento, sem forçar reconstrução
          console.log('Lançamento detectado, mantendo cache intacto para preservar estado de expansão');
        }
      });
    });
    
    return () => unsubscribe();
  }, [selectedPedidoId]);

  const processarEstoque = useCallback((pecas: Peca[] | null, modelos: Modelo[] | null, kits: Kit[] | null) => {
    const stock: StockItem[] = [];
    const getEstoque = (item: any) => item.estoqueTotal || (item.posicoesEstoque?.reduce((sum: number, pos: any) => sum + pos.quantidade, 0) || 0);
    if (kits) kits.forEach(k => { const e = getEstoque(k); if (e > 0) stock.push({ id: k.id, nome: k.nome, tipo: 'kit', quantidade: e, produtoId: k.id, posicoesEstoque: k.posicoesEstoque }); });
    if (modelos) modelos.forEach(m => { const e = getEstoque(m); if (e > 0) stock.push({ id: m.id, nome: m.nome, tipo: 'modelo', quantidade: e, produtoId: m.id, posicoesEstoque: m.posicoesEstoque }); });
    if (pecas) pecas.forEach(p => { const e = getEstoque(p); if (e > 0) stock.push({ id: p.id, nome: p.nome, tipo: 'peca', quantidade: e, produtoId: p.id, posicoesEstoque: p.posicoesEstoque }); });
    setStockItems(prev => {
      const newStock = [...prev];
      stock.forEach(item => {
        const idx = newStock.findIndex(s => s.id === item.id);
        if (idx >= 0) newStock[idx] = item; else newStock.push(item);
      });
      return newStock;
    });
  }, []);

  useEffect(() => {
    const unsubP = onSnapshot(collection(db, 'pecas'), s => processarEstoque(s.docs.map(d => ({ id: d.id, ...d.data() } as Peca)), null, null));
    const unsubM = onSnapshot(collection(db, 'modelos'), s => processarEstoque(null, s.docs.map(d => ({ id: d.id, ...d.data() } as Modelo)), null));
    const unsubK = onSnapshot(collection(db, 'kits'), s => processarEstoque(null, null, s.docs.map(d => ({ id: d.id, ...d.data() } as Kit))));
    return () => { unsubP(); unsubM(); unsubK(); };
  }, [processarEstoque]);

  const atualizarEstoqueVisual = useCallback(() => {
    if (!selectedPedidoId) return;
    const estoqueConsumido = new Map<string, number>();
    pendingOperations.filter(op => op.pedidoId === selectedPedidoId).forEach(op => {
      estoqueConsumido.set(op.stockItem.id, (estoqueConsumido.get(op.stockItem.id) || 0) + op.quantity);
    });
    setStockItems(prev => prev.map(item => {
      const consumido = estoqueConsumido.get(item.id) || 0;
      const original = item.posicoesEstoque?.reduce((s, p) => s + p.quantidade, 0) || (item as any).estoqueTotal || 0;
      return { ...item, quantidade: Math.max(0, original - consumido) };
    }));
  }, [selectedPedidoId, pendingOperations]);

  useEffect(() => { atualizarEstoqueVisual(); }, [pendingOperations, selectedPedidoId]);

  const getStockForSelectedPedido = useCallback((): StockItem[] => {
    if (!selectedPedidoId) return stockItems;
    const cache = hierarquiaCache[selectedPedidoId];
    if (!cache) return stockItems;
    const ids = new Set<string>();
    const coletar = (ns: ProductHierarchyNode[]) => ns.forEach(n => { if (n.targetProductId) ids.add(n.targetProductId); if (n.children) coletar(n.children); });
    coletar(cache.hierarquia);
    return stockItems.filter(i => ids.has(i.produtoId));
  }, [selectedPedidoId, hierarquiaCache, stockItems]);

  const getPedidoSelecionado = useMemo(() => selectedPedidoId ? hierarquiaCache[selectedPedidoId] : undefined, [selectedPedidoId, hierarquiaCache]);

  // Helper function to extract parent context from node hierarchy
  const extractParentContext = useCallback((node: ProductHierarchyNode, hierarchy: ProductHierarchyNode[]): {
    parentModeloId?: string;
    parentKitId?: string;
    hierarchyContext: string;
  } => {
    let parentModeloId: string | undefined;
    let parentKitId: string | undefined;
    
    // Find parent nodes by traversing up the hierarchy
    const findParents = (nodes: ProductHierarchyNode[], targetId: string, path: ProductHierarchyNode[] = []): ProductHierarchyNode[] | null => {
      for (const currentNode of nodes) {
        if (currentNode.id === targetId) {
          return path;
        }
        if (currentNode.children) {
          const found = findParents(currentNode.children, targetId, [...path, currentNode]);
          if (found) return found;
        }
      }
      return null;
    };
    
    const parentPath = findParents(hierarchy, node.id || '');
    
    if (parentPath && parentPath.length > 0) {
      const immediateParent = parentPath[parentPath.length - 1];
      if (immediateParent) {
        if (immediateParent.tipo === 'modelo') {
          parentModeloId = immediateParent.targetProductId;
        } else if (immediateParent.tipo === 'kit') {
          parentKitId = immediateParent.targetProductId;
        }
      }
    }
    
    const hierarchyContext = `root${parentModeloId ? `->modelo:${parentModeloId}` : ''}${parentKitId ? `->kit:${parentKitId}` : ''}`;
    
    return { parentModeloId, parentKitId, hierarchyContext };
  }, []);

  const calculateCascadeScope = useCallback((stockItem: StockItem, targetNode: ProductHierarchyNode): ProductHierarchyNode[] => {
    const scope: ProductHierarchyNode[] = [targetNode];
    const coletar = (n: ProductHierarchyNode) => n.children?.forEach(c => { scope.push(c); coletar(c); });
    if (stockItem.tipo === 'kit' && targetNode.tipo === 'kit') coletar(targetNode);
    else if (stockItem.tipo === 'modelo' && targetNode.tipo === 'modelo') {
      targetNode.children?.forEach(c => { if (c.tipo === 'peca') { scope.push(c); c.children?.forEach(p => { if (p.tipo === 'parte') scope.push(p); }); } });
    } else if (stockItem.tipo === 'peca' && targetNode.tipo === 'peca') {
      targetNode.children?.forEach(c => { if (c.tipo === 'parte') scope.push(c); });
    }
    return scope;
  }, []);

  const validateStockCompatibility = useCallback((stockItem: StockItem, targetNode: ProductHierarchyNode) => {
    if (stockItem.tipo !== targetNode.tipo) return { isValid: false, message: 'Tipo incompatível' };
    if (stockItem.produtoId !== targetNode.targetProductId) return { isValid: false, message: 'Produto diferente' };
    if (stockItem.quantidade <= 0) return { isValid: false, message: 'Estoque insuficiente' };
    if (targetNode.quantidadeNecessaria <= targetNode.quantidadeAtendida) return { isValid: false, message: 'Já atendido' };
    return { isValid: true, message: 'OK' };
  }, []);

  useEffect(() => {
    const newMap: Record<string, { total: number; ops: PendingOperation[] }> = {};
    pendingOperations.forEach(op => {
      op.cascadeScope.forEach(node => {
        if (!newMap[node.id]) newMap[node.id] = { total: 0, ops: [] };
        newMap[node.id].total += op.quantity;
        newMap[node.id].ops.push(op);
      });
    });
    setPendingOpsMap(newMap);
  }, [pendingOperations]);

  const addPendingOperation = useCallback((stockItem: StockItem, targetNode: ProductHierarchyNode, pedidoId: string) => {
    const v = validateStockCompatibility(stockItem, targetNode);
    if (!v.isValid) throw new Error(v.message);
    const scope = calculateCascadeScope(stockItem, targetNode);
    const qty = Math.min(stockItem.quantidade, targetNode.quantidadeNecessaria - targetNode.quantidadeAtendida);
    const op: PendingOperation = { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, stockItem, targetNode, quantity: qty, cascadeScope: scope, timestamp: new Date(), pedidoId };
    setPendingOperations(prev => [...prev, op]);
    return op;
  }, [calculateCascadeScope, validateStockCompatibility]);

  const removePendingOperation = useCallback((id: string) => setPendingOperations(prev => prev.filter(op => op.id !== id)), []);
  const clearPendingOperations = useCallback(() => { setPendingOperations([]); setPendingOpsMap({}); }, []);

  // Função para coletar todos os grupos de montagem abaixo de um nó na hierarquia
  const coletarGruposMontagemDaHierarquia = useCallback((node: ProductHierarchyNode, cache: PedidoComHierarquia): string[] => {
    const gruposIds: string[] = [];
    
    // Função recursiva para percorrer a hierarquia
    const percorrerHierarquia = (currentNode: ProductHierarchyNode) => {
      // Adicionar grupos de montagem deste nó usando jornadaIds (se existir)
      if (currentNode.jornadaIds?.gruposMontagem && currentNode.jornadaIds.gruposMontagem.length > 0) {
        currentNode.jornadaIds.gruposMontagem.forEach(grupoId => {
          if (grupoId && !gruposIds.includes(grupoId)) {
            gruposIds.push(grupoId);
          }
        });
      }
      
      // Fallback: usar gruposMontagem direto (para compatibilidade)
      if (currentNode.gruposMontagem && currentNode.gruposMontagem.length > 0) {
        currentNode.gruposMontagem.forEach(grupo => {
          if (grupo.id && !gruposIds.includes(grupo.id)) {
            gruposIds.push(grupo.id);
          }
        });
      }
      
      // Percorrer filhos
      if (currentNode.children) {
        currentNode.children.forEach(filho => percorrerHierarquia(filho));
      }
    };
    
    percorrerHierarquia(node);
    return gruposIds;
  }, []);

  // Função para coletar todos os grupos de produção abaixo de um nó na hierarquia
  const coletarGruposProducaoDaHierarquia = useCallback((node: ProductHierarchyNode, cache: PedidoComHierarquia): string[] => {
    const gruposIds: string[] = [];
    
    // Função recursiva para percorrer a hierarquia
    const percorrerHierarquia = (currentNode: ProductHierarchyNode) => {
      // Adicionar grupos de produção deste nó usando jornadaIds (se existir)
      if (currentNode.jornadaIds?.gruposProducao && currentNode.jornadaIds.gruposProducao.length > 0) {
        currentNode.jornadaIds.gruposProducao.forEach(grupoId => {
          if (grupoId && !gruposIds.includes(grupoId)) {
            gruposIds.push(grupoId);
          }
        });
      }
      
      // Fallback: usar gruposProducao direto (para compatibilidade)
      if (currentNode.gruposProducao && currentNode.gruposProducao.length > 0) {
        currentNode.gruposProducao.forEach(grupo => {
          if (grupo.id && !gruposIds.includes(grupo.id)) {
            gruposIds.push(grupo.id);
          }
        });
      }
      
      // Percorrer filhos
      if (currentNode.children) {
        currentNode.children.forEach(filho => percorrerHierarquia(filho));
      }
    };
    
    percorrerHierarquia(node);
    return gruposIds;
  }, []);

  // Função para coletar todas as partes de um nó (desce na hierarquia)
  const coletarPartesDoNode = useCallback((node: ProductHierarchyNode): string[] => {
    const partes: string[] = [];
    
    const coletarRecursivo = (currentNode: ProductHierarchyNode) => {
      // Se for uma parte, adicionar ao array
      if (currentNode.tipo === 'parte' && currentNode.targetProductId) {
        partes.push(currentNode.targetProductId);
      }
      
      // Se for uma peça, modelo ou kit, descer na hierarquia
      if (currentNode.children) {
        currentNode.children.forEach(filho => coletarRecursivo(filho));
      }
    };
    
    coletarRecursivo(node);
    return partes;
  }, []);

  // Função para mapear grupos de produção afetados pelo uso de estoque (VERSÃO MELHORADA)
  const mapearGruposProducaoAfetados = useCallback((
    operations: PendingOperation[],
    cache: PedidoComHierarquia
  ): Array<{
    grupoProducaoId: string;
    assemblyInstances: string[];
    modificacoes: Record<string, number>;
  }> => {
    console.log('DEBUG [mapearGruposProducaoAfetados]: Iniciando mapeamento');
    console.log('  - Operações:', operations.length);
    console.log('  - Grupos de produção disponíveis:', cache.gruposProducao.length);
    
    const gruposAfetadosMap = new Map<string, {
      grupoProducaoId: string;
      assemblyInstances: Set<string>;
      modificacoes: Record<string, number>;
    }>();

    const { gruposProducao, hierarquia } = cache;
    
    // Para cada operação pendente
    operations.forEach((op, opIndex) => {
      const { stockItem, targetNode, quantity } = op;
      
      console.log(`\n  DEBUG [Op ${opIndex}]: ${stockItem.nome} (${stockItem.tipo}) → ${targetNode.nome} (${targetNode.tipo})`);
      console.log(`    - Quantidade: ${quantity}`);
      console.log(`    - targetProductId: ${targetNode.targetProductId}`);
      
      // Encontrar o nó na hierarquia para obter contexto completo
      const encontrarNodeNaHierarquia = (nodes: ProductHierarchyNode[]): ProductHierarchyNode | null => {
        for (const node of nodes) {
          if (node.id === targetNode.id) return node;
          if (node.children) {
            const encontrado = encontrarNodeNaHierarquia(node.children);
            if (encontrado) return encontrado;
          }
        }
        return null;
      };
      
      const nodeNaHierarquia = encontrarNodeNaHierarquia(hierarquia);
      if (!nodeNaHierarquia) {
        console.log(`    - AVISO: Nó não encontrado na hierarquia`);
        return;
      }
      
      // Coletar todas as partes associadas a este nó (descer na hierarquia)
      const partesDoNode = coletarPartesDoNode(nodeNaHierarquia);
      console.log(`    - Partes encontradas (${partesDoNode.length}):`, partesDoNode);
      
      // Se não encontrou partes, usar o targetProductId diretamente (pode ser uma parte)
      const idsParaBuscar = partesDoNode.length > 0 ? partesDoNode : targetNode.targetProductId ? [targetNode.targetProductId] : [];
      
      if (idsParaBuscar.length === 0) {
        console.log(`    - AVISO: Nenhum ID para buscar`);
        return;
      }
      
      // Encontrar grupos de produção que contêm qualquer uma das partes
      const gruposRelevantes = gruposProducao.filter(grupo => {
        // Verificar se o grupo contém qualquer uma das partes nas partesNoGrupo
        const contemParte = idsParaBuscar.some(parteId => 
          grupo.partesNoGrupo && grupo.partesNoGrupo[parteId] !== undefined
        );
        
        if (contemParte) {
          console.log(`    - Grupo ${grupo.id} contém parte`);
          return true;
        }
        
        // Verificar se o grupo tem o sourceId igual ao targetProductId
        if (grupo.sourceId === targetNode.targetProductId) {
          console.log(`    - Grupo ${grupo.id} tem sourceId igual`);
          return true;
        }
        
        // Verificar se algum pedidoOrigem tem assemblyInstances que correspondem
        if (grupo.pedidosOrigem) {
          const temAssemblyInstances = grupo.pedidosOrigem.some(pedidoOrigem => 
            pedidoOrigem.assemblyInstances?.some(instance => {
              if (!instance.assemblyInstanceId) return false;
              const parsed = parseAssemblyInstanceId(instance.assemblyInstanceId);
              return idsParaBuscar.some(id => 
                parsed.pecaId === id ||
                parsed.modeloId === id ||
                parsed.kitId === id
              );
            })
          );
          
          if (temAssemblyInstances) {
            console.log(`    - Grupo ${grupo.id} tem assemblyInstances correspondentes`);
            return true;
          }
        }
        
        return false;
      });
      
      console.log(`    - Grupos relevantes encontrados: ${gruposRelevantes.length}`);
      
      // Para cada grupo relevante, adicionar/modificar no mapa
      gruposRelevantes.forEach(grupo => {
        if (!grupo.id) return;
        
        const grupoKey = grupo.id;
        if (!gruposAfetadosMap.has(grupoKey)) {
          gruposAfetadosMap.set(grupoKey, {
            grupoProducaoId: grupo.id,
            assemblyInstances: new Set<string>(),
            modificacoes: {}
          });
        }
        
        const grupoData = gruposAfetadosMap.get(grupoKey)!;
        
        // Coletar assemblyInstances associados a este grupo
        if (grupo.pedidosOrigem) {
          grupo.pedidosOrigem.forEach(pedidoOrigem => {
            pedidoOrigem.assemblyInstances?.forEach(instance => {
              if (instance.assemblyInstanceId) {
                grupoData.assemblyInstances.add(instance.assemblyInstanceId);
              }
            });
          });
        }
        
        // Adicionar modificação para cada parte consumida
        idsParaBuscar.forEach(parteId => {
          if (grupo.partesNoGrupo?.[parteId]) {
            const campo = `partesNoGrupo.${parteId}.quantidade`;
            const valorAtual = grupoData.modificacoes[campo] || 0;
            // Valor negativo indica consumo (redução)
            // Distribuir a quantidade entre as partes (simplificação: dividir igualmente)
            const quantidadePorParte = quantity / idsParaBuscar.length;
            grupoData.modificacoes[campo] = valorAtual - quantidadePorParte;
            
            console.log(`    - Modificação: ${campo} = ${grupoData.modificacoes[campo]} (${quantidadePorParte} por parte)`);
          }
        });
      });
    });
    
    // Converter mapa para array
    const resultado = Array.from(gruposAfetadosMap.values()).map(grupo => ({
      grupoProducaoId: grupo.grupoProducaoId,
      assemblyInstances: Array.from(grupo.assemblyInstances),
      modificacoes: grupo.modificacoes
    }));
    
    console.log('\n  DEBUG [mapearGruposProducaoAfetados]: Resultado final');
    console.log(`  - Total de grupos afetados: ${resultado.length}`);
    resultado.forEach((g, i) => {
      console.log(`    [${i}] ${g.grupoProducaoId}: ${g.assemblyInstances.length} assemblyInstances, ${Object.keys(g.modificacoes).length} modificações`);
    });
    
    return resultado;
  }, [parseAssemblyInstanceId, coletarPartesDoNode]);

  const confirmStockUsage = useCallback(async (pedidoId: string) => {
    const ops = pendingOperations.filter(op => op.pedidoId === pedidoId);
    if (ops.length === 0) return { success: false, message: 'Vazio' };
    
    try {
      const cache = hierarquiaCache[pedidoId];
      if (!cache) return { success: false, message: 'Cache do pedido não encontrado' };
      
      const { gruposMontagem, hierarquia } = cache;
      const rootOp = ops[0];
      
      // COLETAR TODOS OS GRUPOS DA HIERARQUIA (CASCATA COMPLETA)
      const todosGruposMontagemIds = new Set<string>();
      
      // Para cada operação, coletar grupos da hierarquia completa
      ops.forEach(op => {
        const { targetNode } = op;
        
        // Encontrar o nó na hierarquia
        const encontrarNodeNaHierarquia = (nodes: ProductHierarchyNode[]): ProductHierarchyNode | null => {
          for (const node of nodes) {
            if (node.id === targetNode.id) return node;
            if (node.children) {
              const encontrado = encontrarNodeNaHierarquia(node.children);
              if (encontrado) return encontrado;
            }
          }
          return null;
        };
        
        const nodeNaHierarquia = encontrarNodeNaHierarquia(hierarquia);
        if (nodeNaHierarquia) {
          const gruposDoNode = coletarGruposMontagemDaHierarquia(nodeNaHierarquia, cache);
          gruposDoNode.forEach(id => todosGruposMontagemIds.add(id));
        }
      });
      
      // Se não encontrou grupos na hierarquia, usar lógica antiga como fallback
      if (todosGruposMontagemIds.size === 0) {
        console.log('DEBUG: Nenhum grupo encontrado na hierarquia, usando lógica antiga');
        ops.forEach(op => {
          const { targetNode } = op;
          const gruposCorrespondentes = gruposMontagem.filter(gm => {
            if (gm.targetProductId !== targetNode.targetProductId) return false;
            const nodeContext = extractParentContext(targetNode, hierarquia);
            const contextMatches = 
              (!nodeContext.parentModeloId || gm.parentModeloId === nodeContext.parentModeloId) &&
              (!nodeContext.parentKitId || gm.parentKitId === nodeContext.parentKitId);
            return contextMatches;
          });
          gruposCorrespondentes.forEach(gm => {
            if (gm.id) todosGruposMontagemIds.add(gm.id);
          });
        });
      }
      
      console.log('DEBUG: Total de grupos coletados da hierarquia:', todosGruposMontagemIds.size);
      console.log('DEBUG: IDs dos grupos:', Array.from(todosGruposMontagemIds));
      
      // Criar array de grupos afetados
      const gruposMontagemAfetados: Array<{
        grupoMontagemId: string;
        assemblyInstanceId: string;
        modificacoes: Array<{
          campo: string;
          valor: any;
        }>;
      }> = [];
      
      // Para cada grupo coletado, criar modificações
      Array.from(todosGruposMontagemIds).forEach(grupoId => {
        const grupo = gruposMontagem.find(gm => gm.id === grupoId);
        if (!grupo) return;
        
        // Para cada operação, adicionar atendimento
        ops.forEach(op => {
          const { stockItem, quantity } = op;
          
          // INCLUIR TODOS OS GRUPOS, não apenas os que correspondem exatamente
          // O handler usará produtoRaizId e produtoRaizTipo para aplicar a modificação correta
          // Para grupos de componentes, usar o targetProductId do grupo, não do nó raiz
          const produtoRaizId = grupo.targetProductId || op.targetNode.targetProductId || '';
          const produtoRaizTipo = stockItem.tipo; // O tipo do item de estoque (kit, modelo, peça)
          
          gruposMontagemAfetados.push({
            grupoMontagemId: grupo.id || '',
            assemblyInstanceId: grupo.assemblyInstanceId || '',
            modificacoes: [
              {
                campo: 'atendimentoDetalhado',
                valor: { 
                  origem: `estoque_${stockItem.tipo}`, 
                  quantidade: quantity, 
                  timestamp: new Date().toISOString(),
                  produtoRaizId,
                  produtoRaizTipo
                }
              }
            ]
          });
        });
      });
      
      // COLETAR TODOS OS GRUPOS DE PRODUÇÃO DA HIERARQUIA (MESMA LÓGICA DOS GRUPOS DE MONTAGEM)
      const todosGruposProducaoIds = new Set<string>();
      
      // Para cada operação, coletar grupos da hierarquia completa
      ops.forEach(op => {
        const { targetNode } = op;
        
        // Encontrar o nó na hierarquia
        const encontrarNodeNaHierarquia = (nodes: ProductHierarchyNode[]): ProductHierarchyNode | null => {
          for (const node of nodes) {
            if (node.id === targetNode.id) return node;
            if (node.children) {
              const encontrado = encontrarNodeNaHierarquia(node.children);
              if (encontrado) return encontrado;
            }
          }
          return null;
        };
        
        const nodeNaHierarquia = encontrarNodeNaHierarquia(hierarquia);
        if (nodeNaHierarquia) {
          const gruposDoNode = coletarGruposProducaoDaHierarquia(nodeNaHierarquia, cache);
          gruposDoNode.forEach(id => todosGruposProducaoIds.add(id));
        }
      });
      
      console.log('DEBUG: Total de grupos de produção coletados da hierarquia:', todosGruposProducaoIds.size);
      console.log('DEBUG: IDs dos grupos de produção:', Array.from(todosGruposProducaoIds));
      
      // Criar array de grupos de produção afetados (MESMA ESTRUTURA DOS GRUPOS DE MONTAGEM)
      const gruposProducaoAfetados: Array<{
        grupoProducaoId: string;
        assemblyInstances: string[];
        modificacoes: Array<{
          campo: string;
          valor: any;
        }>;
      }> = [];
      
      // Para cada grupo coletado, criar modificações
      Array.from(todosGruposProducaoIds).forEach(grupoId => {
        const grupo = cache.gruposProducao.find(gp => gp.id === grupoId);
        if (!grupo) return;
        
        // Coletar assemblyInstances associados a este grupo APENAS DO PEDIDO ATENDIDO
        const assemblyInstances: string[] = [];
        if (grupo.pedidosOrigem) {
          grupo.pedidosOrigem.forEach(pedidoOrigem => {
            // FILTRAR: Apenas assemblyInstances do pedido que está sendo atendido
            if (pedidoOrigem.pedidoId === pedidoId) {
              pedidoOrigem.assemblyInstances?.forEach(instance => {
                if (instance.assemblyInstanceId && !assemblyInstances.includes(instance.assemblyInstanceId)) {
                  assemblyInstances.push(instance.assemblyInstanceId);
                }
              });
            }
          });
        }
        
        // Se não encontrou assemblyInstances para este pedido, pular este grupo
        if (assemblyInstances.length === 0) {
          console.log(`DEBUG: Grupo ${grupoId} não tem assemblyInstances para o pedido atendido ${pedidoId}`);
          return;
        }
        
        console.log(`DEBUG: Grupo ${grupoId} tem ${assemblyInstances.length} assemblyInstances para o pedido ${pedidoId}:`, assemblyInstances);
        
        // Para cada operação, adicionar modificações
        ops.forEach(op => {
          const { stockItem, quantity } = op;
          
          // Determinar qual parte do grupo está sendo consumida
          const parteConsumida = op.targetNode.targetProductId;
          const modificacoes: Array<{ campo: string; valor: any }> = [];
          
          // Se o grupo tem a parte nas partesNoGrupo, adicionar modificação
          if (parteConsumida && grupo.partesNoGrupo?.[parteConsumida]) {
            modificacoes.push({
              campo: `partesNoGrupo.${parteConsumida}.quantidade`,
              valor: -quantity // Valor negativo indica consumo
            });
          }
          
          // Se não encontrou parte específica, adicionar modificação genérica
          if (modificacoes.length === 0) {
            modificacoes.push({
              campo: 'quantidadeConsumida',
              valor: {
                origem: `estoque_${stockItem.tipo}`,
                quantidade: quantity,
                timestamp: new Date().toISOString(),
                produtoRaizId: op.targetNode.targetProductId || '',
                produtoRaizTipo: stockItem.tipo
              }
            });
          }
          
          gruposProducaoAfetados.push({
            grupoProducaoId: grupo.id || '',
            assemblyInstances,
            modificacoes
          });
        });
      });
      
      // Se não encontrou grupos na hierarquia, usar a função antiga como fallback
      if (todosGruposProducaoIds.size === 0) {
        console.log('DEBUG: Nenhum grupo de produção encontrado na hierarquia, usando mapeamento antigo');
        const gruposMapeados = mapearGruposProducaoAfetados(ops, cache);
        
        // Converter para a nova estrutura
        gruposMapeados.forEach(grupo => {
          gruposProducaoAfetados.push({
            grupoProducaoId: grupo.grupoProducaoId,
            assemblyInstances: grupo.assemblyInstances,
            modificacoes: Object.entries(grupo.modificacoes).map(([campo, valor]) => ({
              campo,
              valor
            }))
          });
        });
      }
      
      console.log('DEBUG: Grupos de produção afetados:', gruposProducaoAfetados.length);
      console.log('DEBUG: Detalhes dos grupos de produção:', gruposProducaoAfetados.map(g => ({
        grupoProducaoId: g.grupoProducaoId,
        assemblyInstancesCount: g.assemblyInstances.length,
        modificacoesCount: g.modificacoes.length
      })));
      
      // Criar payload COMPLETO
      const payload: any = { 
        pedidoId, 
        nivelUsado: rootOp.targetNode.nivel, 
        produtoRaiz: { 
          id: rootOp.targetNode.targetProductId || '', 
          tipo: rootOp.stockItem.tipo, 
          quantidade: rootOp.quantity 
        }, 
        produtosConsumidos: [], 
        posicoesConsumidas: [],
        gruposMontagemAfetados,
        gruposProducaoAfetados,
        timestamp: new Date().toISOString()
      };
      
      // Manter dados antigos para compatibilidade
      ops.forEach(op => {
        op.cascadeScope.forEach(n => payload.produtosConsumidos.push({ 
          produtoId: n.targetProductId || '', 
          produtoTipo: n.tipo, 
          quantidade: op.quantity, 
          nivel: n.nivel 
        }));
        
        // Coletar todas as posições de estoque do item
        const posicoesEstoque = op.stockItem.posicoesEstoque || [];
        
        if (posicoesEstoque.length > 0) {
          const pos = posicoesEstoque[0];
          payload.posicoesConsumidas.push({ 
            produtoId: op.targetNode.targetProductId || '', 
            produtoTipo: op.stockItem.tipo, 
            posicaoEstoqueId: (pos.recipienteId || pos.localId || 'geral') as string, 
            quantidade: op.quantity 
          });
        } else {
          payload.posicoesConsumidas.push({ 
            produtoId: op.targetNode.targetProductId || '', 
            produtoTipo: op.stockItem.tipo, 
            posicaoEstoqueId: `estoque-${op.stockItem.id}`, 
            quantidade: op.quantity 
          });
        }
      });
      
      console.log('DEBUG: Payload enviado (CASCATA COMPLETA):', {
        pedidoId,
        gruposMontagemAfetadosCount: gruposMontagemAfetados.length,
        gruposMontagemAfetados: gruposMontagemAfetados.map(g => ({
          grupoMontagemId: g.grupoMontagemId,
          assemblyInstanceId: g.assemblyInstanceId
        }))
      });
      
      const ref = await addDoc(collection(db, 'lancamentosProducao'), { 
        tipoEvento: 'uso_estoque', 
        timestamp: serverTimestamp(), 
        usuarioId: 'usuario-sistema', 
        payload, 
        status: 'pendente' 
      });
      
      setPendingOperations(prev => prev.filter(op => op.pedidoId !== pedidoId));
      return { success: true, message: 'OK', lancamentoId: ref.id };
    } catch (e: any) { 
      console.error('Erro ao confirmar uso de estoque:', e);
      return { success: false, message: e.message }; 
    }
  }, [pendingOperations, hierarquiaCache, extractParentContext, coletarGruposMontagemDaHierarquia]);

  const encontrarNodePorId = useCallback((id: string, nodes: ProductHierarchyNode[]): ProductHierarchyNode | null => {
    for (const n of nodes) { if (n.id === id) return n; if (n.children) { const f = encontrarNodePorId(id, n.children); if (f) return f; } }
    return null;
  }, []);

  const getQuantidadeAtendidaTotal = useCallback((nodeId: string, pedidoId?: string): number => {
    const pid = pedidoId || selectedPedidoId;
    if (!pid || !hierarquiaCache[pid]) return 0;
    const hierarquia = hierarquiaCache[pid].hierarquia || [];
    const node = encontrarNodePorId(nodeId, hierarquia);
    if (!node) return 0;
    return node.quantidadeAtendida + (pendingOpsMap[nodeId]?.total || 0);
  }, [hierarquiaCache, selectedPedidoId, pendingOpsMap, encontrarNodePorId]);

  const getPendingOperationsForNode = useCallback((nodeId: string) => {
    if (!selectedPedidoId || !pendingOpsMap[nodeId]) return [];
    return pendingOpsMap[nodeId].ops.map(op => ({ id: op.id, quantity: op.quantity, stockItem: { nome: op.stockItem.nome, tipo: op.stockItem.tipo } }));
  }, [pendingOpsMap, selectedPedidoId]);

  const buildJourneyPath = useCallback((assemblyInstanceId: string) => {
    const parsed = parseAssemblyInstanceId(assemblyInstanceId);
    const journey = [];
    
    // Build complete path based on journey array
    if (parsed.journey.length > 0) {
      for (let i = 0; i < parsed.journey.length; i++) {
        const step = parsed.journey[i];
        const stepId = step.id || '';
        
        if (i === 0) {
          journey.push({
            tipo: 'pedido',
            id: stepId,
            instance: step.instance,
            assemblyInstanceId: assemblyInstanceId
          });
        } else if (i === parsed.journey.length - 1) {
          journey.push({
            tipo: step.tipo,
            id: stepId,
            instance: step.instance,
            assemblyInstanceId: assemblyInstanceId
          });
        } else {
          journey.push({
            tipo: step.tipo,
            id: stepId,
            instance: step.instance,
            assemblyInstanceId: assemblyInstanceId
          });
        }
      }
    }
    
    return journey;
  }, [parseAssemblyInstanceId]);

  // Parse assemblyInstanceId to extract hierarchical path - FIXED VERSION
  const parseAssemblyInstanceIdForNavigation = useCallback((assemblyInstanceId: string) => {
    console.log('DEBUG: Parsing assemblyInstanceId:', assemblyInstanceId);
    
    const parts = assemblyInstanceId.split('-');
    const result = {
      pedidoId: parts[0],
      kitId: undefined as string | undefined,
      kitInstance: 1,
      modeloId: undefined as string | undefined,
      modeloInstance: 1,
      pecaId: undefined as string | undefined,
      pecaInstance: 1,
      levels: [] as Array<{ type: string; id: string; instance: number }>
    };
    
    let i = 0;
    while (i < parts.length) {
      let productId = '';
      let instance = 1;
      
      // Extract product ID (can contain dashes)
      while (i < parts.length) {
        const part = parts[i];
        const parsedNumber = parseInt(part);
        
        // Check if this is a valid instance number (not part of ID)
        if (!isNaN(parsedNumber) && i > 0) { // Not the first part (pedidoId)
          // Look ahead to see if next part is also a number (for multi-digit instances)
          let nextPart = parts[i + 1];
          if (nextPart && !isNaN(parseInt(nextPart))) {
            instance = parsedNumber;
            i++;
            continue;
          } else if (productId) { // Only break if we have accumulated some product ID
            instance = parsedNumber;
            i++;
            break;
          } else {
            // This might be a product ID that looks like a number
            productId = productId ? productId + '-' + part : part;
            i++;
          }
        } else {
          productId = productId ? productId + '-' + part : part;
          i++;
        }
      }
      
      result.levels.push({ type: 'produto', id: productId, instance });
    }
    
    // Map levels based on structure - FIXED LOGIC
    if (result.levels.length >= 2) {
      // Level 1: pedidoId (already set)
      // Level 2+: products
      for (let j = 1; j < result.levels.length; j++) {
        const level = result.levels[j];
        
        if (j === 1) {
          // This could be kit or modelo depending on total levels
          if (result.levels.length === 2) {
            // pedido + modelo: this is a modelo
            result.modeloId = level.id;
            result.modeloInstance = level.instance;
          } else if (result.levels.length === 3) {
            // pedido + kit + peca: this is a kit
            result.kitId = level.id;
            result.kitInstance = level.instance;
          } else if (result.levels.length >= 4) {
            // pedido + kit + modelo + peca: this is a kit
            result.kitId = level.id;
            result.kitInstance = level.instance;
          }
        } else if (j === 2) {
          if (result.levels.length === 3) {
            // pedido + kit + peca: this is a peca
            result.pecaId = level.id;
            result.pecaInstance = level.instance;
          } else if (result.levels.length >= 4) {
            // pedido + kit + modelo + peca: this is a modelo
            result.modeloId = level.id;
            result.modeloInstance = level.instance;
          }
        } else if (j === 3) {
          // pedido + kit + modelo + peca: this is a peca
          result.pecaId = level.id;
          result.pecaInstance = level.instance;
        }
      }
    }
    
    console.log('DEBUG: Parsed result:', result);
    return result;
  }, []);

  // Helper function to find a node in hierarchy by targetProductId
  const findNodeByTargetId = useCallback((nodes: ProductHierarchyNode[], targetProductId: string): ProductHierarchyNode | null => {
    for (const node of nodes) {
      if (node.targetProductId === targetProductId) return node;
      if (node.children) {
        const found = findNodeByTargetId(node.children, targetProductId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Navigate hierarchy following assemblyInstanceId path
  const findNodeByAssemblyPath = useCallback((assemblyInstanceId: string, hierarchy: ProductHierarchyNode[]): ProductHierarchyNode | null => {
    const parsed = parseAssemblyInstanceIdForNavigation(assemblyInstanceId);
    console.log('DEBUG: Parsed assemblyInstanceId for navigation:', parsed);
    
    if (!parsed.kitId || !parsed.pecaId) {
      console.log('DEBUG: Invalid assemblyInstanceId structure');
      return null;
    }
    
    // 1. Find the kit in hierarchy
    const kitNode = findNodeByTargetId(hierarchy, parsed.kitId);
    if (!kitNode) {
      console.log('DEBUG: Kit not found:', parsed.kitId);
      return null;
    }
    
    console.log('DEBUG: Found kit:', kitNode.nome, 'type:', kitNode.tipo);
    
    // 2. If there's a modelo, find it within the kit
    let searchNode = kitNode;
    if (parsed.modeloId) {
      const modeloNode = kitNode.children 
        ? findNodeByTargetId(kitNode.children, parsed.modeloId)
        : null;
      
      if (!modeloNode) {
        console.log('DEBUG: Modelo not found:', parsed.modeloId);
        return null;
      }
      
      console.log('DEBUG: Found modelo:', modeloNode.nome, 'type:', modeloNode.tipo);
      searchNode = modeloNode;
    }
    
    // 3. Find the final piece
    const pecaNode = searchNode.children 
      ? findNodeByTargetId(searchNode.children, parsed.pecaId)
      : null;
    
    if (pecaNode) {
      console.log('DEBUG: Found peca:', pecaNode.nome, 'type:', pecaNode.tipo);
    } else {
      console.log('DEBUG: Peça not found:', parsed.pecaId);
    }
    
    return pecaNode;
  }, [parseAssemblyInstanceIdForNavigation, findNodeByTargetId]);

  // Helper function to find a node in hierarchy by ID
  const findNodeInHierarchy = useCallback((nodeId: string, hierarchy: ProductHierarchyNode[]): ProductHierarchyNode | null => {
    for (const node of hierarchy) {
      if (node.id === nodeId) return node;
      if (node.children) {
        const found = findNodeInHierarchy(nodeId, node.children);
        if (found) return found;
      }
    }
    return null;
  }, []);


  // Precise matching function with hierarchical discrimination
  const isMatchingAssemblyGroup = useCallback((node: ProductHierarchyNode, group: GrupoMontagem, nodeContext: { parentModeloId?: string; parentKitId?: string }): boolean => {
    console.log('DEBUG: Checking precise match for node:', node.nome, 'group:', group.id);
    console.log('DEBUG: Node context:', nodeContext);
    console.log('DEBUG: Group context:', { parentModeloId: group.parentModeloId, parentKitId: group.parentKitId });
    
    // 1. targetProductId must match
    if (group.targetProductId !== node.targetProductId) {
      console.log('DEBUG: targetProductId mismatch');
      return false;
    }
    
    // 2. Hierarchical discrimination
    const nodeHasParentModelo = !!nodeContext.parentModeloId;
    const nodeHasParentKit = !!nodeContext.parentKitId;
    const groupHasParentModelo = !!group.parentModeloId;
    const groupHasParentKit = !!group.parentKitId;
    
    console.log('DEBUG: Hierarchical flags:', {
      nodeHasParentModelo,
      nodeHasParentKit,
      groupHasParentModelo,
      groupHasParentKit
    });
    
    // Match exact hierarchical context
    const contextMatches = 
      (nodeHasParentModelo === groupHasParentModelo) &&
      (nodeHasParentKit === groupHasParentKit) &&
      (!nodeHasParentModelo || group.parentModeloId === nodeContext.parentModeloId) &&
      (!nodeHasParentKit || group.parentKitId === nodeContext.parentKitId);
    
    console.log('DEBUG: Context matches:', contextMatches);
    
    if (contextMatches) {
      console.log('DEBUG: ✓ Precise hierarchical match found!');
      return true;
    }
    
    console.log('DEBUG: ✗ No hierarchical match');
    return false;
  }, []);

  // Função para verificar status de atendimento de um nó
  const verificarStatusAtendimento = useCallback((
    node: ProductHierarchyNode,
    gruposMontagem: GrupoMontagem[],
    pedidoId: string
  ): {
    estaAtendido: boolean;
    quantidadeJaAtendida: number;
    origemAtendimento: string[];
    percentualAtendido: number;
    statusAtendimento: 'nao_atendido' | 'parcialmente_atendido' | 'totalmente_atendido';
  } => {
    let quantidadeJaAtendida = 0;
    const origemAtendimento: string[] = [];

    // Verificar atendimento nos grupos de montagem
    const gruposRelevantes = gruposMontagem.filter(grupo => {
      if (grupo.targetProductId !== node.targetProductId) return false;
      
      // Verificar contexto hierárquico
      const nodeContext = extractParentContext(node, hierarquiaCache[pedidoId]?.hierarquia || []);
      const contextMatches = 
        (!nodeContext.parentModeloId || grupo.parentModeloId === nodeContext.parentModeloId) &&
        (!nodeContext.parentKitId || grupo.parentKitId === nodeContext.parentKitId);
      
      return contextMatches;
    });

    gruposRelevantes.forEach(grupo => {
      if (grupo.pecasNecessarias) {
        grupo.pecasNecessarias.forEach((peca: any) => {
          if (peca.pecaId === node.targetProductId && peca.atendimentoDetalhado) {
            peca.atendimentoDetalhado.forEach((atendimento: any) => {
              quantidadeJaAtendida += atendimento.quantidade;
              origemAtendimento.push(`${atendimento.origem} (${new Date(atendimento.timestamp.seconds * 1000).toLocaleDateString()})`);
            });
          }
        });
      } else if (grupo.modelosNecessarios) {
        grupo.modelosNecessarios.forEach((modelo: any) => {
          if (modelo.modeloId === node.targetProductId && modelo.atendimentoDetalhado) {
            modelo.atendimentoDetalhado.forEach((atendimento: any) => {
              quantidadeJaAtendida += atendimento.quantidade;
              origemAtendimento.push(`${atendimento.origem} (${new Date(atendimento.timestamp.seconds * 1000).toLocaleDateString()})`);
            });
          }
        });
      } else if (grupo.produtosFinaisNecessarios) {
        grupo.produtosFinaisNecessarios.forEach((produto: any) => {
          if (produto.produtoId === node.targetProductId && (produto as any).atendimentoDetalhado) {
            (produto as any).atendimentoDetalhado.forEach((atendimento: any) => {
              quantidadeJaAtendida += atendimento.quantidade;
              origemAtendimento.push(`${atendimento.origem} (${new Date(atendimento.timestamp.seconds * 1000).toLocaleDateString()})`);
            });
          }
        });
      }
    });

    // Verificar atendimento via lançamentos de uso de estoque
    // TODO: Implementar consulta a lancamentosProducao quando necessário

    const percentualAtendido = node.quantidadeNecessaria > 0 
      ? (quantidadeJaAtendida / node.quantidadeNecessaria) * 100 
      : 0;

    const estaAtendido = quantidadeJaAtendida >= node.quantidadeNecessaria;
    
    let statusAtendimento: 'nao_atendido' | 'parcialmente_atendido' | 'totalmente_atendido';
    if (percentualAtendido === 0) {
      statusAtendimento = 'nao_atendido';
    } else if (percentualAtendido >= 100) {
      statusAtendimento = 'totalmente_atendido';
    } else {
      statusAtendimento = 'parcialmente_atendido';
    }

    return {
      estaAtendido,
      quantidadeJaAtendida,
      origemAtendimento: [...new Set(origemAtendimento)], // Remover duplicatas
      percentualAtendido,
      statusAtendimento
    };
  }, [extractParentContext, hierarquiaCache]);

  const enrichNodeWithJourney = useCallback(async (node: ProductHierarchyNode, pedidoId: string): Promise<ProductHierarchyNode> => {
    const cache = hierarquiaCache[pedidoId];
    if (!cache) return node;

    const allProductionGroups = cache.gruposProducao;
    const allAssemblyGroups = cache.gruposMontagem;

    console.log('DEBUG: Enriching node:', node.nome, 'targetProductId:', node.targetProductId);
    console.log('DEBUG: Node level:', node.nivel, 'parentId:', node.parentId);
    console.log('DEBUG: Available production groups:', allProductionGroups.length);
    console.log('DEBUG: Available assembly groups:', allAssemblyGroups.length);

    // Verificar status de atendimento
    const statusAtendimento = verificarStatusAtendimento(node, allAssemblyGroups, pedidoId);

    // Find production groups that contain instances matching this node's targetProductId
    const relevantProductionGroups = allProductionGroups.filter(pg => {
      // Check if this production group matches the target product
      if (pg.sourceId === node.targetProductId) {
        console.log('DEBUG: Found production group by sourceId:', pg.id);
        return true;
      }
      
      // Also check if target product is in the partesNoGrupo
      if (pg.partesNoGrupo && pg.partesNoGrupo[node.targetProductId || '']) {
        console.log('DEBUG: Found production group by partesNoGrupo:', pg.id);
        return true;
      }
      
      // Check if any assembly instance in any pedidoOrigem matches the targetProductId
      const foundInPedidosOrigem = pg.pedidosOrigem?.some(pedidoOrigem => {
        return pedidoOrigem.assemblyInstances?.some(instance => {
          if (!instance.assemblyInstanceId) return false;
          const parsed = parseAssemblyInstanceId(instance.assemblyInstanceId);
          const matches = parsed.pecaId === node.targetProductId ||
                         parsed.modeloId === node.targetProductId ||
                         parsed.kitId === node.targetProductId;
          if (matches) {
            console.log('DEBUG: Found production group by assemblyInstanceId:', pg.id, 'instance:', instance.assemblyInstanceId);
          }
          return matches;
        });
      }) || false;
      
      if (foundInPedidosOrigem) {
        console.log('DEBUG: Found production group by pedidosOrigem:', pg.id);
        return true;
      }
      
      return false;
    });

    console.log('DEBUG: Relevant production groups found:', relevantProductionGroups.length);

    // Find assembly groups using PRECISE HIERARCHICAL MATCHING ONLY
    const nodeContext = extractParentContext(node, cache.hierarquia);
    
    console.log('DEBUG: Node hierarchical context:', nodeContext);
    
    const relevantAssemblyGroups = allAssemblyGroups.filter(ag => {
      if (!ag.assemblyInstanceId) return false;
      
      console.log('DEBUG: Checking assembly group:', ag.id, 'assemblyInstanceId:', ag.assemblyInstanceId);
      
      // APPROACH 1: PRECISE HIERARCHICAL MATCHING (PRIMARY LOGIC)
      const preciseMatch = isMatchingAssemblyGroup(node, ag, nodeContext);
      if (preciseMatch) {
        console.log('DEBUG: ✓ Found assembly group by precise hierarchical matching:', ag.id);
        return true;
      }
      
      // STRICT LEAF NODE DETECTION: NO FALLBACKS FOR PEÇAS
      const isLeafNode = node.tipo === 'peca' && (!node.children || node.children.length === 0);
      
      // Debug: Log node structure analysis
      console.log('DEBUG: Node structure analysis for', node.nome, ':', {
        tipo: node.tipo,
        nivel: node.nivel,
        hasChildren: !!node.children,
        childrenCount: node.children?.length || 0,
        childrenIds: node.children?.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo })) || [],
        isLeafNode,
        isParentNode: !isLeafNode,
        parentId: node.parentId
      });
      
      if (isLeafNode) {
        console.log('DEBUG: ✗ Leaf node (peça) - no fallbacks allowed, rejecting:', ag.id);
        return false;
      }
      
      console.log('DEBUG: Parent node - checking inheritance fallbacks for:', ag.id);
      
      // APPROACH 2-6: ONLY FOR PARENT NODES (inheritance cases)
      
      // Hierarchical navigation (inheritance fallback)
      if (ag.assemblyInstanceId) {
        const targetNodeFromPath = findNodeByAssemblyPath(ag.assemblyInstanceId, cache.hierarquia);
        
        if (targetNodeFromPath && targetNodeFromPath.targetProductId === node.targetProductId) {
          console.log('DEBUG: Found assembly group by hierarchical navigation (inheritance):', ag.id, 'target node:', targetNodeFromPath.nome);
          return true;
        }
      }
      
      // Direct targetProductId match (inheritance fallback)
      if (ag.targetProductId === node.targetProductId) {
        console.log('DEBUG: Found assembly group by direct targetProductId match (inheritance):', ag.id);
        return true;
      }
      
      // parentKitId/parentModeloId match (inheritance fallback)
      if (ag.parentKitId === node.targetProductId || ag.parentModeloId === node.targetProductId) {
        console.log('DEBUG: Found assembly group by parent ID match (inheritance):', ag.id, 'parentKitId:', ag.parentKitId, 'parentModeloId:', ag.parentModeloId);
        return true;
      }
      
      // Contains targetProductId in assemblyInstanceId (inheritance fallback)
      if (ag.assemblyInstanceId && ag.assemblyInstanceId.includes(node.targetProductId || '')) {
        console.log('DEBUG: Found assembly group by assemblyInstanceId contains (inheritance):', ag.id);
        return true;
      }
      
      // Child inheritance check (inheritance fallback)
      const childIds = node.children?.map(child => child.targetProductId).filter((id): id is string => !!id) || [];
      const matchesChild = childIds.some(childId => 
        ag.targetProductId === childId || 
        ag.parentKitId === childId || 
        ag.parentModeloId === childId ||
        (ag.assemblyInstanceId && ag.assemblyInstanceId.includes(childId))
      );
      
      if (matchesChild) {
        console.log('DEBUG: Found assembly group for parent node via child match (inheritance):', ag.id);
        return true;
      }
      
      console.log('DEBUG: No match found for assembly group:', ag.id);
      return false;
    });

    console.log('DEBUG: Relevant assembly groups found:', relevantAssemblyGroups.length);
    console.log('DEBUG: Assembly groups found:', relevantAssemblyGroups.map(ag => ({ id: ag.id, assemblyInstanceId: ag.assemblyInstanceId })));

    // Build journey paths for assembly groups that have assemblyInstanceId
    const journeys = relevantAssemblyGroups
      .filter(ag => ag.assemblyInstanceId)
      .map(ag => buildJourneyPath(ag.assemblyInstanceId as string))
      .flat();

    console.log('DEBUG: Journey paths built:', journeys.length);

    // Enrich node with the found groups and journeys
    const enrichedNode = {
      ...node,
      gruposProducao: relevantProductionGroups,
      gruposMontagem: relevantAssemblyGroups,
      assemblyInstanceIds: journeys,
      temGrupoProducao: relevantProductionGroups.length > 0,
      temGrupoMontagem: relevantAssemblyGroups.length > 0,
      dadosCompletos: true
    };

    console.log('DEBUG: Enriched node:', enrichedNode);
    return enrichedNode;
  }, [hierarquiaCache, parseAssemblyInstanceId, buildJourneyPath, findNodeByAssemblyPath, findNodeByTargetId]);

  return {
    pedidosIniciais, hierarquiaCache, setHierarquiaCache, stockItems, selectedPedidoId, isLoading, pendingOperations,
    setSelectedPedidoId, getStockForSelectedPedido, calculateCascadeScope, handleDrop: addPendingOperation, removePendingOperation, clearPendingOperations, confirmStockUsage,
    getPedidoSelecionado, parseAssemblyInstanceId, getQuantidadeAtendidaTotal, getPendingOperationsForNode, enrichNodeWithJourney
  };
};

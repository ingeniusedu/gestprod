import { useState, useCallback, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, query, where, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Pedido, 
  Peca, 
  Modelo, 
  Kit, 
  Parte,
  GrupoMontagem,
  OptimizedGroup,
  PedidoProduto,
  ModeloComponente,
  PecaComponente,
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
  // IDs para mapeamento com grupos de produção/montagem
  grupoProducaoId?: string;
  grupoMontagemId?: string;
  assemblyInstanceId?: string;
  // Detalhes de atendimento
  atendimentoDetalhado?: Array<{
    origem: string;
    quantidade: number;
    timestamp: any;
  }>;
  // Atendimento via cascata (kit/modelo que atendeu este nó)
  atendimentoViaCascata?: Array<{
    origemId: string; // ID do kit/modelo que atendeu
    origemNome: string; // Nome do kit/modelo
    origemTipo: 'kit' | 'modelo';
    quantidade: number; // Quantidade atendida via esta origem
    operationId?: string; // ID da operação pendente que gerou este atendimento
  }>;
}

interface PedidoComHierarquia {
  pedido: Pedido;
  hierarquia: ProductHierarchyNode[];
  gruposProducao: OptimizedGroup[];
  gruposMontagem: GrupoMontagem[];
}

export interface PendingOperation {
  id: string;
  stockItem: StockItem;
  targetNode: ProductHierarchyNode;
  quantity: number;
  cascadeScope: ProductHierarchyNode[];
  timestamp: Date;
  pedidoId: string; // Adicionado para rastrear a qual pedido pertence esta operação
}

export const useDragAndDropStockV2 = () => {
  const [pedidosComHierarquia, setPedidosComHierarquia] = useState<PedidoComHierarquia[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);

  // Buscar todos os dados necessários
  useEffect(() => {
    const unsubscribePedidos = onSnapshot(collection(db, 'pedidos'), (snapshot) => {
      const pedidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pedido));
      
      // Buscar dados relacionados para cada pedido
      Promise.all(pedidos.map(async (pedido) => {
        const [gruposProducao, gruposMontagem, hierarquia] = await Promise.all([
          fetchGruposProducaoParaPedido(pedido.id),
          fetchGruposMontagemParaPedido(pedido.id),
          construirHierarquiaParaPedido(pedido)
        ]);

        return {
          pedido,
          hierarquia,
          gruposProducao,
          gruposMontagem
        };
      })).then(resultados => {
        setPedidosComHierarquia(resultados);
        setIsLoading(false);
      });
    });

    const unsubscribePecas = onSnapshot(collection(db, 'pecas'), (snapshot) => {
      const pecas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Peca));
      processarEstoque(pecas, null, null);
    });

    const unsubscribeModelos = onSnapshot(collection(db, 'modelos'), (snapshot) => {
      const modelos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Modelo));
      processarEstoque(null, modelos, null);
    });

    const unsubscribeKits = onSnapshot(collection(db, 'kits'), (snapshot) => {
      const kits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit));
      processarEstoque(null, null, kits);
    });

    return () => {
      unsubscribePedidos();
      unsubscribePecas();
      unsubscribeModelos();
      unsubscribeKits();
    };
  }, []);

  // Buscar grupos de produção para um pedido
  const fetchGruposProducaoParaPedido = async (pedidoId: string): Promise<OptimizedGroup[]> => {
    // Implementação simplificada - na prática precisaria buscar da coleção gruposProducaoOtimizados
    return [];
  };

  // Buscar grupos de montagem para um pedido
  const fetchGruposMontagemParaPedido = async (pedidoId: string): Promise<GrupoMontagem[]> => {
    const q = query(collection(db, 'gruposMontagem'), where('pedidoId', '==', pedidoId));
    const snapshot = await new Promise(resolve => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        unsubscribe();
        resolve(snapshot);
      });
    });
    
    return (snapshot as any).docs.map((doc: any) => ({ 
      id: doc.id, 
      ...doc.data() 
    } as GrupoMontagem));
  };

  // Função para buscar dados completos do kit
  const buscarDadosCompletosDoKit = async (kitId: string): Promise<Kit | null> => {
    try {
      const docRef = doc(db, 'kits', kitId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Kit : null;
    } catch (error) {
      console.error('Erro ao buscar dados do kit:', error);
      return null;
    }
  };

  // Função para buscar dados completos do modelo
  const buscarDadosCompletosDoModelo = async (modeloId: string): Promise<Modelo | null> => {
    try {
      const docRef = doc(db, 'modelos', modeloId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Modelo : null;
    } catch (error) {
      console.error('Erro ao buscar dados do modelo:', error);
      return null;
    }
  };

  // Função para buscar dados completos da peça
  const buscarDadosCompletosDaPeca = async (pecaId: string): Promise<Peca | null> => {
    try {
      const docRef = doc(db, 'pecas', pecaId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Peca : null;
    } catch (error) {
      console.error('Erro ao buscar dados da peça:', error);
      return null;
    }
  };

  // Construir hierarquia completa para um pedido
  const construirHierarquiaParaPedido = async (pedido: Pedido): Promise<ProductHierarchyNode[]> => {
    const hierarquia: ProductHierarchyNode[] = [];

    for (const produto of pedido.produtos) {
      const nodeRaiz = await criarNoHierarquico(produto, pedido.id, 0);
      if (nodeRaiz) {
        hierarquia.push(nodeRaiz);
      }
    }

    return hierarquia;
  };

  // Função auxiliar para gerar IDs no padrão do packaging
  const getNodeId = (tipo: string, id: string, parentId?: string): string => {
    switch(tipo) {
      case 'kit': return `kit_${id}`;
      case 'modelo': return `modelo_${id}`;
      case 'peca': 
        // Se for peça direta de kit
        if (parentId && parentId.startsWith('kit_')) {
          return `peca_${id}_kitdirect`;
        }
        // Se for peça de modelo
        if (parentId && parentId.startsWith('modelo_')) {
          return `peca_${id}_${parentId}`;
        }
        return `peca_${id}`;
      case 'parte': return `parte_${id}`;
      default: return id;
    }
  };

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

  // Criar nó hierárquico recursivamente
  const criarNoHierarquico = async (
    produto: PedidoProduto | ModeloComponente | PecaComponente,
    pedidoId: string,
    nivel: number,
    parentId?: string
  ): Promise<ProductHierarchyNode | null> => {
    const produtoId = 'produtoId' in produto ? produto.produtoId : produto.id;
    const tipo = ('tipo' in produto ? produto.tipo : 
                 'modelosComponentes' in produto ? 'kit' : 
                 'pecasComponentes' in produto ? 'modelo' : 'peca') as any;
    
    const nodeId = getNodeId(tipo, produtoId, parentId);
    
    const node: ProductHierarchyNode = {
      id: nodeId,
      nome: 'nomeProduto' in produto ? produto.nomeProduto : produto.nome,
      tipo: ('tipo' in produto ? produto.tipo : 
             'modelosComponentes' in produto ? 'kit' : 
             'pecasComponentes' in produto ? 'modelo' : 'peca') as any,
      quantidadeNecessaria: produto.quantidade,
      quantidadeAtendida: 0, // Será calculado com base no atendimentoDetalhado
      nivel,
      parentId
    };

    // Buscar grupos de montagem para este produto
    const gruposMontagem = await fetchGruposMontagemParaProduto(pedidoId, node);
    if (gruposMontagem.length > 0) {
      node.grupoMontagemId = gruposMontagem[0].id;
      node.assemblyInstanceId = gruposMontagem[0].assemblyInstanceId;
      
      // Calcular quantidade atendida baseada no grupo de montagem
      node.quantidadeAtendida = calcularQuantidadeAtendida(gruposMontagem[0], node.tipo);
      node.atendimentoDetalhado = extrairAtendimentoDetalhado(gruposMontagem[0], node.tipo);
    }

    // Adicionar filhos baseado no tipo
    if ('modelosComponentes' in produto && produto.modelosComponentes) {
      const filhos = await Promise.all(
        produto.modelosComponentes.map(async modelo => 
          await criarNoHierarquico(modelo, pedidoId, nivel + 1, nodeId)
        )
      );
      node.children = filhos.filter((f): f is ProductHierarchyNode => f !== null);
    } else if ('pecasComponentes' in produto && produto.pecasComponentes) {
      const filhos = await Promise.all(
        produto.pecasComponentes.map(async peca => 
          await criarNoHierarquico(peca, pedidoId, nivel + 1, nodeId)
        )
      );
      node.children = filhos.filter((f): f is ProductHierarchyNode => f !== null);
    } else if ('componentes' in produto && (produto as any).componentes) {
      // Para kits com componentes diretos (estrutura nova)
      const componentes = (produto as any).componentes;
      const filhos: ProductHierarchyNode[] = [];
      
      for (const componente of componentes) {
        if (componente.tipo === 'peca') {
          // Criar nó de peça para componente direto
          const pecaNode: ProductHierarchyNode = {
            id: getNodeId('peca', componente.id, nodeId),
            nome: componente.nome,
            tipo: 'peca',
            quantidadeNecessaria: componente.quantidade,
            quantidadeAtendida: 0, // Será calculado com grupos de montagem
            nivel: nivel + 1,
            parentId: nodeId
          };
          
          // Buscar grupos de montagem para esta peça
          const gruposMontagem = await fetchGruposMontagemParaProduto(pedidoId, pecaNode);
          if (gruposMontagem.length > 0) {
            pecaNode.grupoMontagemId = gruposMontagem[0].id;
            pecaNode.assemblyInstanceId = gruposMontagem[0].assemblyInstanceId;
            pecaNode.quantidadeAtendida = calcularQuantidadeAtendida(gruposMontagem[0], 'peca');
            pecaNode.atendimentoDetalhado = extrairAtendimentoDetalhado(gruposMontagem[0], 'peca');
          }
          
          filhos.push(pecaNode);
          
        } else if (componente.tipo === 'modelo') {
          // Para componentes do tipo modelo, precisaríamos buscar os dados completos do modelo
          // Por enquanto, criamos um nó básico
          const modeloNode: ProductHierarchyNode = {
            id: getNodeId('modelo', componente.id, nodeId),
            nome: componente.nome,
            tipo: 'modelo',
            quantidadeNecessaria: componente.quantidade,
            quantidadeAtendida: 0,
            nivel: nivel + 1,
            parentId: nodeId
          };
          
          // Buscar grupos de montagem para este modelo
          const gruposMontagem = await fetchGruposMontagemParaProduto(pedidoId, modeloNode);
          if (gruposMontagem.length > 0) {
            modeloNode.grupoMontagemId = gruposMontagem[0].id;
            modeloNode.assemblyInstanceId = gruposMontagem[0].assemblyInstanceId;
            modeloNode.quantidadeAtendida = calcularQuantidadeAtendida(gruposMontagem[0], 'modelo');
            modeloNode.atendimentoDetalhado = extrairAtendimentoDetalhado(gruposMontagem[0], 'modelo');
          }
          
          filhos.push(modeloNode);
        }
      }
      
      node.children = filhos;
    } else if ('gruposImpressao' in produto && produto.gruposImpressao) {
      // Para peças, adicionar partes como filhos
      const partes: ProductHierarchyNode[] = [];
      for (const grupo of produto.gruposImpressao) {
        if (grupo.partes) {
          for (const parte of grupo.partes) {
            partes.push({
              id: getNodeId('parte', parte.parteId, nodeId),
              nome: parte.nome,
              tipo: 'parte',
              quantidadeNecessaria: parte.quantidade,
              quantidadeAtendida: 0, // Será calculado com grupos de produção
              nivel: nivel + 1,
              parentId: nodeId
            });
          }
        }
      }
      node.children = partes;
    }

    // Se for um kit, buscar dados completos para incluir peças diretas
    if (node.tipo === 'kit') {
      const kitCompleto = await buscarDadosCompletosDoKit(produtoId);
      if (kitCompleto) {
        const filhosAdicionais: ProductHierarchyNode[] = [];
        
        // Processar modelos do kit (estrutura antiga)
        if (kitCompleto.modelos) {
          for (const modeloKit of kitCompleto.modelos) {
            const modeloCompleto = await buscarDadosCompletosDoModelo(modeloKit.modeloId);
            if (modeloCompleto && modeloCompleto.pecas) {
              for (const pecaModelo of modeloCompleto.pecas) {
                // Buscar nome da peça
                const pecaCompleta = await buscarDadosCompletosDaPeca(pecaModelo.pecaId);
                const nomePeca = pecaCompleta?.nome || `Peça ${pecaModelo.pecaId}`;
                
                const pecaNode: ProductHierarchyNode = {
                  id: getNodeId('peca', pecaModelo.pecaId, nodeId),
                  nome: `[Modelo] ${modeloCompleto.nome} → ${nomePeca}`,
                  tipo: 'peca',
                  quantidadeNecessaria: pecaModelo.quantidade * modeloKit.quantidade * node.quantidadeNecessaria,
                  quantidadeAtendida: 0,
                  nivel: nivel + 1,
                  parentId: nodeId
                };
                filhosAdicionais.push(pecaNode);
              }
            }
          }
        }
        
        // Processar componentes diretos do kit (estrutura nova)
        if (kitCompleto.componentes) {
          for (const componente of kitCompleto.componentes) {
            if (componente.tipo === 'peca') {
              const pecaNode: ProductHierarchyNode = {
                id: getNodeId('peca', componente.id, nodeId),
                nome: `[Direta] ${componente.nome}`,
                tipo: 'peca',
                quantidadeNecessaria: componente.quantidade * node.quantidadeNecessaria,
                quantidadeAtendida: 0,
                nivel: nivel + 1,
                parentId: nodeId
              };
              filhosAdicionais.push(pecaNode);
            }
          }
        }
        
        // Adicionar filhos adicionais aos filhos existentes
        if (filhosAdicionais.length > 0) {
          node.children = [...(node.children || []), ...filhosAdicionais];
        }
      }
    }

    return node;
  };

  // Buscar grupos de montagem para um produto específico
  const fetchGruposMontagemParaProduto = async (
    pedidoId: string, 
    node: ProductHierarchyNode
  ): Promise<GrupoMontagem[]> => {
    // Extrair ID real do nó para buscar grupos de montagem
    const idReal = extrairIdReal(node.id);
    
    const q = query(
      collection(db, 'gruposMontagem'),
      where('pedidoId', '==', pedidoId),
      where('targetProductId', '==', idReal),
      where('targetProductType', '==', node.tipo)
    );
    
    const snapshot = await new Promise(resolve => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        unsubscribe();
        resolve(snapshot);
      });
    });
    
    return (snapshot as any).docs.map((doc: any) => ({ 
      id: doc.id, 
      ...doc.data() 
    } as GrupoMontagem));
  };

  // Calcular quantidade atendida baseada no grupo de montagem
  const calcularQuantidadeAtendida = (grupo: GrupoMontagem, tipo: string): number => {
    if (tipo === 'peca' && grupo.pecasNecessarias) {
      return grupo.pecasNecessarias.reduce((sum, peca) => 
        sum + (peca.quantidadeAtendida || 0), 0
      );
    } else if (tipo === 'modelo' && grupo.modelosNecessarios) {
      return grupo.modelosNecessarios.reduce((sum, modelo) => 
        sum + (modelo.quantidadeAtendida || 0), 0
      );
    } else if (tipo === 'kit' && grupo.produtosFinaisNecessarios) {
      return grupo.produtosFinaisNecessarios.reduce((sum, produto) => 
        sum + (produto.quantidadeAtendida || 0), 0
      );
    }
    return 0;
  };

  // Extrair atendimento detalhado do grupo de montagem
  const extrairAtendimentoDetalhado = (
    grupo: GrupoMontagem, 
    tipo: string
  ): Array<{ origem: string; quantidade: number; timestamp: any }> => {
    if (tipo === 'peca' && grupo.pecasNecessarias) {
      return grupo.pecasNecessarias.flatMap(peca => 
        peca.atendimentoDetalhado || []
      );
    } else if (tipo === 'modelo' && grupo.modelosNecessarios) {
      return grupo.modelosNecessarios.flatMap(modelo => 
        modelo.atendimentoDetalhado || []
      );
    } else if (tipo === 'kit' && grupo.produtosFinaisNecessarios) {
      // Para kits, retornar array vazio por enquanto
      // O atendimento detalhado para kits é complexo e pode ser implementado posteriormente
      return [];
    }
    return [];
  };

  // Processar estoque disponível
  const processarEstoque = (
    pecas: Peca[] | null,
    modelos: Modelo[] | null,
    kits: Kit[] | null
  ) => {
    const stock: StockItem[] = [];

    if (kits) {
      kits.forEach(kit => {
        const estoque = kit.estoqueTotal || (kit.posicoesEstoque?.reduce((sum, pos) => sum + pos.quantidade, 0) || 0);
        if (estoque > 0) {
          stock.push({
            id: kit.id,
            nome: kit.nome,
            tipo: 'kit',
            quantidade: estoque,
            produtoId: kit.id,
            posicoesEstoque: kit.posicoesEstoque
          });
        }
      });
    }

    if (modelos) {
      modelos.forEach(modelo => {
        const estoque = modelo.estoqueTotal || (modelo.posicoesEstoque?.reduce((sum, pos) => sum + pos.quantidade, 0) || 0);
        if (estoque > 0) {
          stock.push({
            id: modelo.id,
            nome: modelo.nome,
            tipo: 'modelo',
            quantidade: estoque,
            produtoId: modelo.id,
            posicoesEstoque: modelo.posicoesEstoque
          });
        }
      });
    }

    if (pecas) {
      pecas.forEach(peca => {
        const estoque = peca.estoqueTotal || (peca.posicoesEstoque?.reduce((sum, pos) => sum + pos.quantidade, 0) || 0);
        if (estoque > 0) {
          stock.push({
            id: peca.id,
            nome: peca.nome,
            tipo: 'peca',
            quantidade: estoque,
            produtoId: peca.id,
            posicoesEstoque: peca.posicoesEstoque
          });
        }
      });
    }

    setStockItems(prev => {
      const newStock = [...prev];
      // Atualizar ou adicionar itens
      stock.forEach(item => {
        const index = newStock.findIndex(s => s.id === item.id);
        if (index >= 0) {
          newStock[index] = item;
        } else {
          newStock.push(item);
        }
      });
      return newStock;
    });
  };

  // Filtrar estoque para o pedido selecionado
  const getStockForSelectedPedido = useCallback((): StockItem[] => {
    if (!selectedPedidoId) return getAvailableStockItems();
    
    const pedidoSelecionado = pedidosComHierarquia.find(p => p.pedido.id === selectedPedidoId);
    if (!pedidoSelecionado) return getAvailableStockItems();

    // Coletar todos os IDs reais dos produtos necessários no pedido
    const idsNecessarios = new Set<string>();
    const coletarIds = (nodes: ProductHierarchyNode[]) => {
      nodes.forEach(node => {
        // Extrair ID real do nó (removendo prefixos e sufixos)
        const idReal = extrairIdReal(node.id);
        idsNecessarios.add(idReal);
        
        if (node.children) {
          coletarIds(node.children);
        }
      });
    };
    
    coletarIds(pedidoSelecionado.hierarquia);
    
    // Filtrar estoque para mostrar apenas itens com IDs que correspondem aos necessários
    return getAvailableStockItems().filter(item => idsNecessarios.has(item.produtoId));
  }, [selectedPedidoId, pedidosComHierarquia, stockItems, pendingOperations]);

  // Calcular estoque disponível considerando operações pendentes
  const getAvailableStockItems = useCallback((): StockItem[] => {
    // Calcular quantidades reservadas por produtoId
    const reservedQuantities: Record<string, number> = {};
    
    pendingOperations.forEach(op => {
      const produtoId = op.stockItem.produtoId;
      reservedQuantities[produtoId] = (reservedQuantities[produtoId] || 0) + op.quantity;
    });
    
    // Retornar itens com quantidades ajustadas
    return stockItems.map(item => {
      const reserved = reservedQuantities[item.produtoId] || 0;
      const quantidadeDisponivel = Math.max(0, item.quantidade - reserved);
      
      return {
        ...item,
        quantidade: quantidadeDisponivel,
        quantidadeOriginal: item.quantidade, // Manter original para referência
        quantidadeReservada: reserved
      };
    });
  }, [stockItems, pendingOperations]);

  // Obter operações pendentes para um nó específico
  const getPendingOperationsForNode = useCallback((nodeId: string): PendingOperation[] => {
    return pendingOperations.filter(op => op.targetNode.id === nodeId);
  }, [pendingOperations]);

  // Obter quantidade atendida total (incluindo pendente e via cascata) para um nó
  const getQuantidadeAtendidaTotal = useCallback((node: ProductHierarchyNode): number => {
    const operacoesPendentes = getPendingOperationsForNode(node.id);
    const quantidadePendente = operacoesPendentes.reduce((sum, op) => sum + op.quantity, 0);
    
    // Calcular quantidade atendida via cascata
    const quantidadeViaCascata = node.atendimentoViaCascata?.reduce((sum, cascata) => 
      sum + cascata.quantidade, 0
    ) || 0;
    
    return node.quantidadeAtendida + quantidadePendente + quantidadeViaCascata;
  }, [getPendingOperationsForNode]);

  // Calcular escopo de cascata
  const calculateCascadeScope = useCallback((
    stockItem: StockItem,
    targetNode: ProductHierarchyNode
  ): ProductHierarchyNode[] => {
    const scope: ProductHierarchyNode[] = [targetNode];

    const coletarDescendentes = (node: ProductHierarchyNode) => {
      if (node.children) {
        node.children.forEach(child => {
          scope.push(child);
          coletarDescendentes(child);
        });
      }
    };

    if (stockItem.tipo === 'kit' && targetNode.tipo === 'kit') {
      // Kit em Kit: inclui todos os descendentes
      coletarDescendentes(targetNode);
    } else if (stockItem.tipo === 'modelo' && targetNode.tipo === 'modelo') {
      // Modelo em Modelo: inclui apenas peças
      if (targetNode.children) {
        targetNode.children.forEach(child => {
          if (child.tipo === 'peca') {
            scope.push(child);
            // Incluir partes das peças também
            if (child.children) {
              child.children.forEach(parte => {
                if (parte.tipo === 'parte') {
                  scope.push(parte);
                }
              });
            }
          }
        });
      }
    } else if (stockItem.tipo === 'peca' && targetNode.tipo === 'peca') {
      // Peça em Peça: inclui partes da peça
      if (targetNode.children) {
        targetNode.children.forEach(child => {
          if (child.tipo === 'parte') {
            scope.push(child);
          }
        });
      }
    }
    // Parte em Parte: apenas a parte específica (já incluída)

    return scope;
  }, []);

  // Validar se o estoque é compatível com o nó alvo
  const validateStockCompatibility = useCallback((
    stockItem: StockItem,
    targetNode: ProductHierarchyNode
  ): { isValid: boolean; message: string } => {
    // Verificar se os tipos são compatíveis
    if (stockItem.tipo !== targetNode.tipo) {
      return { 
        isValid: false, 
        message: `Tipo incompatível: Estoque é ${stockItem.tipo}, mas o alvo é ${targetNode.tipo}` 
      };
    }

    // Verificar se os IDs são iguais (mesmo produto) - usando extrairIdReal para lidar com IDs formatados
    const idRealTarget = extrairIdReal(targetNode.id);
    
    if (stockItem.produtoId !== idRealTarget) {
      return { 
        isValid: false, 
        message: `Produto diferente: Estoque é ${stockItem.nome} (ID: ${stockItem.produtoId}), mas o alvo é ${targetNode.nome} (ID real: ${idRealTarget}, ID formatado: ${targetNode.id})` 
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
    const quantidadeNecessaria = targetNode.quantidadeNecessaria - targetNode.quantidadeAtendida;
    if (quantidadeNecessaria <= 0) {
      return { 
        isValid: false, 
        message: `Nó já totalmente atendido: ${targetNode.nome} já tem ${targetNode.quantidadeAtendida}/${targetNode.quantidadeNecessaria} unidades` 
      };
    }

    return { isValid: true, message: 'Compatível' };
  }, []);

  // Função auxiliar para criar operações em cascata
  const createCascadeOperations = useCallback((
    stockItem: StockItem,
    targetNode: ProductHierarchyNode,
    quantidadeAplicar: number,
    cascadeScope: ProductHierarchyNode[],
    pedidoId: string // Adicionado parâmetro pedidoId
  ): { operation: PendingOperation; cascadeAttendances: Array<{node: ProductHierarchyNode; quantidade: number}> } => {
    // Operação principal
    const mainOperation: PendingOperation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      stockItem,
      targetNode,
      quantity: quantidadeAplicar,
      cascadeScope,
      timestamp: new Date(),
      pedidoId // Adicionado pedidoId à operação
    };
    
    const cascadeAttendances: Array<{node: ProductHierarchyNode; quantidade: number}> = [];
    
    // Se for kit ou modelo, registrar atendimento via cascata para subitens
    if ((stockItem.tipo === 'kit' && targetNode.tipo === 'kit') ||
        (stockItem.tipo === 'modelo' && targetNode.tipo === 'modelo')) {
      
      // Para cada nó no escopo de cascata (excluindo o nó principal)
      cascadeScope.slice(1).forEach(cascadeNode => {
        // Calcular quantidade atendida via cascata
        // A quantidade é proporcional à quantidade aplicada no nó principal
        const proporcao = cascadeNode.quantidadeNecessaria / targetNode.quantidadeNecessaria;
        const quantidadeAtendidaViaCascata = Math.ceil(quantidadeAplicar * proporcao);
        
        if (quantidadeAtendidaViaCascata > 0) {
          cascadeAttendances.push({
            node: cascadeNode,
            quantidade: quantidadeAtendidaViaCascata
          });
        }
      });
    }
    
    return { operation: mainOperation, cascadeAttendances };
  }, []);

  // Adicionar operação pendente (com cascata automática)
  const addPendingOperation = useCallback((
    stockItem: StockItem,
    targetNode: ProductHierarchyNode,
    pedidoId: string
  ) => {
    // Validar compatibilidade
    const validation = validateStockCompatibility(stockItem, targetNode);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }

    const cascadeScope = calculateCascadeScope(stockItem, targetNode);
    const quantidadeNecessaria = targetNode.quantidadeNecessaria - targetNode.quantidadeAtendida;
    const quantidadeDisponivel = stockItem.quantidade;
    const quantidadeAplicar = Math.min(quantidadeDisponivel, quantidadeNecessaria);
    
    // Criar operação principal e registrar atendimento via cascata
    const { operation: mainOperation, cascadeAttendances } = createCascadeOperations(
      stockItem, 
      targetNode, 
      quantidadeAplicar, 
      cascadeScope,
      pedidoId // Adicionado pedidoId como quinto parâmetro
    );
    
    // Adicionar operação principal
    setPendingOperations(prev => [...prev, mainOperation]);
    
    // Registrar atendimento via cascata nos nós correspondentes
    if (cascadeAttendances.length > 0) {
      setPedidosComHierarquia(prev => 
        prev.map(pedidoComHierarquia => {
          if (pedidoComHierarquia.pedido.id !== pedidoId) return pedidoComHierarquia;
          
          // Função recursiva para atualizar nós com atendimento via cascata
          const atualizarNoComCascata = (node: ProductHierarchyNode): ProductHierarchyNode => {
            // Verificar se este nó está na lista de atendimentos via cascata
            const cascataParaEsteNo = cascadeAttendances.find(ca => ca.node.id === node.id);
            
            let novoAtendimentoViaCascata = [...(node.atendimentoViaCascata || [])];
            
            if (cascataParaEsteNo) {
              // Adicionar ou atualizar registro de cascata
              const registroCascata = {
                origemId: stockItem.id,
                origemNome: stockItem.nome,
                origemTipo: stockItem.tipo as 'kit' | 'modelo',
                quantidade: cascataParaEsteNo.quantidade,
                operationId: mainOperation.id
              };
              
              // Verificar se já existe registro para esta origem
              const indexExistente = novoAtendimentoViaCascata.findIndex(
                c => c.origemId === stockItem.id && c.operationId === mainOperation.id
              );
              
              if (indexExistente >= 0) {
                novoAtendimentoViaCascata[indexExistente] = registroCascata;
              } else {
                novoAtendimentoViaCascata.push(registroCascata);
              }
            }
            
            // Atualizar filhos recursivamente
            const novosFilhos = node.children?.map(atualizarNoComCascata) || [];
            
            return {
              ...node,
              atendimentoViaCascata: novoAtendimentoViaCascata.length > 0 ? novoAtendimentoViaCascata : undefined,
              children: novosFilhos
            };
          };
          
          const novaHierarquia = pedidoComHierarquia.hierarquia.map(atualizarNoComCascata);
          
          return {
            ...pedidoComHierarquia,
            hierarquia: novaHierarquia
          };
        })
      );
    }
    
    // Retornar a operação principal
    return mainOperation;
  }, [calculateCascadeScope, validateStockCompatibility, createCascadeOperations]);

  // Remover operação pendente (e remover atendimento via cascata dos subitens se for kit/modelo)
  const removePendingOperation = useCallback((operationId: string) => {
    setPendingOperations(prev => {
      // Encontrar a operação a ser removida
      const operationToRemove = prev.find(op => op.id === operationId);
      if (!operationToRemove) return prev;
      
      // Usar o pedidoId armazenado na operação (agora temos esse campo)
      const pedidoId = operationToRemove.pedidoId;
      
      // Remover atendimento via cascata dos nós (se for kit ou modelo)
      if ((operationToRemove.stockItem.tipo === 'kit' || operationToRemove.stockItem.tipo === 'modelo') && pedidoId) {
        setPedidosComHierarquia(prevPedidos => 
          prevPedidos.map(pedidoComHierarquia => {
            if (pedidoComHierarquia.pedido.id !== pedidoId) return pedidoComHierarquia;
            
            // Função recursiva para remover atendimento via cascata
            const removerCascataDoNo = (node: ProductHierarchyNode): ProductHierarchyNode => {
              // Filtrar atendimento via cascata para remover registros desta operação
              const novoAtendimentoViaCascata = node.atendimentoViaCascata?.filter(
                cascata => cascata.operationId !== operationId
              );
              
              // Atualizar filhos recursivamente
              const novosFilhos = node.children?.map(removerCascataDoNo) || [];
              
              return {
                ...node,
                atendimentoViaCascata: novoAtendimentoViaCascata && novoAtendimentoViaCascata.length > 0 
                  ? novoAtendimentoViaCascata 
                  : undefined,
                children: novosFilhos
              };
            };
            
            const novaHierarquia = pedidoComHierarquia.hierarquia.map(removerCascataDoNo);
            
            return {
              ...pedidoComHierarquia,
              hierarquia: novaHierarquia
            };
          })
        );
      }
      
      // Remover apenas a operação principal (não há mais operações de cascata para remover)
      return prev.filter(op => op.id !== operationId);
    });
  }, []);

  // Limpar todas as operações pendentes
  const clearPendingOperations = useCallback(() => {
    setPendingOperations([]);
  }, []);

  // Confirmar uso de estoque (processar todas as operações pendentes)
  const confirmStockUsage = useCallback(async (pedidoId: string) => {
    if (pendingOperations.length === 0) {
      console.log('Nenhuma operação pendente para confirmar');
      return { success: false, message: 'Nenhuma operação pendente' };
    }

    try {
      console.log('Confirmando uso de estoque para', pendingOperations.length, 'operações');
      
      // Filtrar operações apenas para este pedido
      const operacoesDoPedido = pendingOperations.filter(op => op.pedidoId === pedidoId);
      if (operacoesDoPedido.length === 0) {
        return { success: false, message: 'Nenhuma operação pendente para este pedido' };
      }
      
      // Coletar dados do pedido para contexto
      const pedidoComHierarquia = pedidosComHierarquia.find(p => p.pedido.id === pedidoId);
      if (!pedidoComHierarquia) {
        return { success: false, message: 'Pedido não encontrado' };
      }
      
      // Construir payload de uso de estoque
      const payload: UsoEstoquePayload = {
        pedidoId,
        nivelUsado: 0, // Nível raiz (será calculado para cada operação)
        produtoRaiz: {
          id: '', // Será preenchido com o primeiro produto raiz
          tipo: 'kit', // Default, será ajustado
          quantidade: 0 // Será calculado
        },
        produtosConsumidos: [],
        posicoesConsumidas: []
      };
      
      // Para cada operação, coletar informações
      const produtosConsumidosMap = new Map<string, {
        produtoId: string;
        produtoTipo: 'kit' | 'modelo' | 'peca' | 'parte';
        quantidade: number;
        nivel: number;
        parentModeloId?: string | null;
        parentKitId?: string | null;
        assemblyInstanceId?: string | null;
      }>();
      
      // Processar cada operação
      for (const operation of operacoesDoPedido) {
        const { stockItem, targetNode, quantity, cascadeScope } = operation;
        
        // Extrair ID real do nó
        const idReal = extrairIdReal(targetNode.id);
        
        // Determinar contexto (parentModeloId, parentKitId, assemblyInstanceId)
        let parentModeloId: string | undefined;
        let parentKitId: string | undefined;
        let assemblyInstanceId: string | undefined;
        
        // Extrair contexto do ID do nó
        if (targetNode.id.includes('_modelo_')) {
          // Formato: peca_XXX_modelo_YYY
          const match = targetNode.id.match(/modelo_([^_]+)/);
          if (match) {
            parentModeloId = match[1];
          }
        } else if (targetNode.id.includes('_kitdirect')) {
          // Formato: peca_XXX_kitdirect
          const match = targetNode.id.match(/kit_([^_]+)/);
          if (match) {
            parentKitId = match[1];
          }
        }
        
        // Buscar assemblyInstanceId do grupo de montagem
        if (targetNode.grupoMontagemId) {
          const grupoMontagem = pedidoComHierarquia.gruposMontagem.find(
            g => g.id === targetNode.grupoMontagemId
          );
          if (grupoMontagem) {
            assemblyInstanceId = grupoMontagem.assemblyInstanceId;
            
            // Se não encontramos parentModeloId/parentKitId pelo ID do nó,
            // tentar extrair do grupo de montagem
            if (!parentModeloId && grupoMontagem.parentModeloId) {
              parentModeloId = grupoMontagem.parentModeloId;
            }
            if (!parentKitId && grupoMontagem.parentKitId) {
              parentKitId = grupoMontagem.parentKitId;
            }
          }
        }
        
        // Adicionar produto raiz (primeira operação define o produto raiz)
        if (payload.produtoRaiz.id === '') {
          payload.produtoRaiz = {
            id: idReal,
            tipo: stockItem.tipo,
            quantidade: quantity
          };
          payload.nivelUsado = targetNode.nivel;
        }
        
        // Adicionar produto consumido principal
        const keyPrincipal = `${stockItem.tipo}_${idReal}`;
        const existingPrincipal = produtosConsumidosMap.get(keyPrincipal);
        if (existingPrincipal) {
          existingPrincipal.quantidade += quantity;
        } else {
          produtosConsumidosMap.set(keyPrincipal, {
            produtoId: idReal,
            produtoTipo: stockItem.tipo,
            quantidade: quantity,
            nivel: targetNode.nivel,
            parentModeloId: parentModeloId || null,
            parentKitId: parentKitId || null,
            assemblyInstanceId: assemblyInstanceId || null
          });
        }
        
        // Adicionar produtos consumidos via cascata
        if (cascadeScope.length > 1) {
          for (const cascadeNode of cascadeScope.slice(1)) {
            const cascadeIdReal = extrairIdReal(cascadeNode.id);
            const cascadeKey = `${cascadeNode.tipo}_${cascadeIdReal}`;
            
            // Calcular quantidade via cascata (proporcional)
            const proporcao = cascadeNode.quantidadeNecessaria / targetNode.quantidadeNecessaria;
            const quantidadeCascata = Math.ceil(quantity * proporcao);
            
            if (quantidadeCascata > 0) {
              const existingCascade = produtosConsumidosMap.get(cascadeKey);
              if (existingCascade) {
                existingCascade.quantidade += quantidadeCascata;
              } else {
              produtosConsumidosMap.set(cascadeKey, {
                produtoId: cascadeIdReal,
                produtoTipo: cascadeNode.tipo as 'kit' | 'modelo' | 'peca' | 'parte',
                quantidade: quantidadeCascata,
                nivel: cascadeNode.nivel,
                parentModeloId: cascadeNode.parentId?.includes('modelo_') ? 
                  cascadeNode.parentId.replace('modelo_', '') : null,
                parentKitId: cascadeNode.parentId?.includes('kit_') ? 
                  cascadeNode.parentId.replace('kit_', '') : null,
                assemblyInstanceId: cascadeNode.assemblyInstanceId || null
              });
              }
            }
          }
        }
        
        // Adicionar posições de estoque consumidas
        if (stockItem.posicoesEstoque && stockItem.posicoesEstoque.length > 0) {
          // Para simplificar, usamos a primeira posição de estoque
          // Em uma implementação real, precisaríamos rastrear qual posição foi usada
          const posicao = stockItem.posicoesEstoque[0];
          payload.posicoesConsumidas.push({
            produtoId: idReal,
            produtoTipo: stockItem.tipo,
            posicaoEstoqueId: posicao.recipienteId || posicao.localId || 'desconhecido',
            quantidade: quantity
          });
        } else {
          // Se não houver posições específicas, usar um ID genérico
          payload.posicoesConsumidas.push({
            produtoId: idReal,
            produtoTipo: stockItem.tipo,
            posicaoEstoqueId: 'estoque-geral',
            quantidade: quantity
          });
        }
      }
      
      // Converter mapa para array e remover campos extras que não estão na interface
      payload.produtosConsumidos = Array.from(produtosConsumidosMap.values()).map(item => ({
        produtoId: item.produtoId,
        produtoTipo: item.produtoTipo,
        quantidade: item.quantidade,
        nivel: item.nivel
        // Não incluir parentModeloId, parentKitId, assemblyInstanceId pois não estão na interface UsoEstoquePayload
      }));
      
      console.log('Payload de uso de estoque construído:', payload);
      
      // Criar LancamentoProducao
      const lancamentoProducaoRef = await addDoc(collection(db, 'lancamentosProducao'), {
        tipoEvento: 'uso_estoque',
        timestamp: serverTimestamp(),
        usuarioId: 'usuario-sistema', // TODO: Obter ID do usuário atual
        payload: payload,
        status: 'pendente'
      });
      
      console.log('LancamentoProducao criado com ID:', lancamentoProducaoRef.id);
      
      // Limpar apenas as operações deste pedido
      setPendingOperations(prev => prev.filter(op => op.pedidoId !== pedidoId));
      
      return { 
        success: true, 
        message: `${operacoesDoPedido.length} operações confirmadas e enviadas para processamento`,
        lancamentoId: lancamentoProducaoRef.id
      };
    } catch (error) {
      console.error('Erro ao confirmar uso de estoque:', error);
      return { success: false, message: 'Erro ao processar operações: ' + (error as Error).message };
    }
  }, [pendingOperations, pedidosComHierarquia]);

  // Manipular drop (adiciona à lista de pendentes)
  const handleDrop = useCallback((
    stockItem: StockItem,
    targetNode: ProductHierarchyNode,
    pedidoId: string
  ) => {
    console.log('Drop realizado - adicionando à lista de pendentes:', { 
      stockItem, 
      targetNode, 
      pedidoId
    });
    
    const operation = addPendingOperation(stockItem, targetNode, pedidoId);
    
    return operation;
  }, [addPendingOperation]);

  return {
    // Dados
    pedidosComHierarquia,
    stockItems,
    selectedPedidoId,
    isLoading,
    pendingOperations,
    
    // Ações
    setSelectedPedidoId,
    getStockForSelectedPedido,
    calculateCascadeScope,
    handleDrop,
    addPendingOperation,
    removePendingOperation,
    clearPendingOperations,
    confirmStockUsage,
    
    // Novas funções para UI
    getAvailableStockItems,
    getPendingOperationsForNode,
    getQuantidadeAtendidaTotal,
    
    // Utilitários
    getPedidoSelecionado: () => 
      pedidosComHierarquia.find(p => p.pedido.id === selectedPedidoId)
  };
};

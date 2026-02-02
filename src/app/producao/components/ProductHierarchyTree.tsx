import React, { useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Package, Box, Square, Layers, CheckCircle, XCircle } from 'lucide-react';
import { GrupoMontagem } from '../../types';
import { useExpansionContext } from '../../contexts/ExpansionContext';

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
  gruposProducao?: any[];
  gruposMontagem?: any[];
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

interface ProductHierarchyTreeProps {
  nodes?: ProductHierarchyNode[];
  gruposMontagem?: GrupoMontagem[];
  gruposProducao?: any[];
  pedidoId?: string;
  onNodeClick?: (node: ProductHierarchyNode) => void;
  onNodeDragOver?: (node: ProductHierarchyNode) => void;
  onNodeDrop?: (node: ProductHierarchyNode) => void;
  selectedNodeId?: string;
  hoverNodeId?: string;
  getQuantidadeAtendidaTotal?: (nodeId: string) => number;
  getPendingOperationsForNode?: (nodeId: string) => Array<{
    id: string;
    quantity: number;
    stockItem: { nome: string; tipo: string };
  }>;
  onRemovePendingOperation?: (operationId: string) => void;
  setHierarquiaCache?: (updater: (prev: any) => any) => void;
  showAllStatus?: boolean; // Novo parâmetro para mostrar todos os itens independente do status
}

const HierarchyNode: React.FC<{
  node: ProductHierarchyNode;
  depth: number;
  expandedNodes: Set<string>;
  selectedNodeId?: string;
  hoverNodeId?: string;
  toggleNode: (id: string) => void;
  onNodeClick?: (node: ProductHierarchyNode) => void;
  onNodeDragOver?: (node: ProductHierarchyNode) => void;
  onNodeDrop?: (node: ProductHierarchyNode) => void;
  getQuantidadeAtendidaTotal?: (nodeId: string) => number;
  getPendingOperationsForNode?: (nodeId: string) => any[];
  onRemovePendingOperation?: (id: string) => void;
}> = React.memo(({
  node, depth, expandedNodes, selectedNodeId, hoverNodeId, toggleNode,
  onNodeClick, onNodeDragOver, onNodeDrop,
  getQuantidadeAtendidaTotal, getPendingOperationsForNode, onRemovePendingOperation
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const isHovered = hoverNodeId === node.id;
  
  const quantidadeAtendidaTotal = getQuantidadeAtendidaTotal ? getQuantidadeAtendidaTotal(node.id) : node.quantidadeAtendida;
  const percent = Math.min(100, (quantidadeAtendidaTotal / (node.quantidadeNecessaria || 1)) * 100);

  // Determinar status de atendimento
  const statusAtendimento = node.statusAtendimento || 
    (percent >= 100 ? 'totalmente_atendido' : percent > 0 ? 'parcialmente_atendido' : 'nao_atendido');

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'kit': return <Package className="h-4 w-4 text-purple-600" />;
      case 'modelo': return <Box className="h-4 w-4 text-blue-600" />;
      case 'peca': return <Square className="h-4 w-4 text-green-600" />;
      default: return <Layers className="h-4 w-4 text-gray-600" />;
    }
  };

  // Obter cor de fundo baseada no status de atendimento
  const getBackgroundColor = () => {
    if (isSelected) return 'bg-blue-50 border border-blue-300';
    if (isHovered) return 'bg-blue-25 border border-blue-200';
    
    switch (statusAtendimento) {
      case 'totalmente_atendido':
        return 'bg-green-50 border border-green-200 opacity-75';
      case 'parcialmente_atendido':
        return 'bg-yellow-50 border border-yellow-200';
      default:
        return 'hover:bg-gray-50 border border-transparent';
    }
  };

  // Obter ícone de status
  const getStatusIcon = () => {
    switch (statusAtendimento) {
      case 'totalmente_atendido':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'parcialmente_atendido':
        return <div className="h-4 w-4 rounded-full border-2 border-yellow-500" />;
      default:
        return <XCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center py-2 px-3 rounded-lg transition-all cursor-pointer ${getBackgroundColor()}`}
        style={{ marginLeft: `${depth * 24}px` }}
        onClick={() => onNodeClick?.(node)}
        onDragOver={(e) => { e.preventDefault(); onNodeDragOver?.(node); }}
        onDrop={() => onNodeDrop?.(node)}
      >
        {hasChildren ? (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              toggleNode(node.id); 
            }} 
            className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={isExpanded ? "Encolher" : "Expandir"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : <div className="w-6" />}
        
        <div className="mr-3">{getIcon(node.tipo)}</div>
        <div className="mr-2">{getStatusIcon()}</div>
        
        <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 truncate">{node.nome}</span>
                <span className="text-xs text-gray-500 uppercase">{node.tipo}</span>
              </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span>{node.quantidadeAtendida}{quantidadeAtendidaTotal > node.quantidadeAtendida && <span className="text-yellow-600 ml-1">+{Math.round((quantidadeAtendidaTotal - node.quantidadeAtendida) * 100) / 100}</span>}</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="font-semibold">{node.quantidadeNecessaria}</span>
              </div>
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div className={`h-2 rounded-full ${percent >= 100 ? 'bg-green-500' : percent > 0 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>

          {getPendingOperationsForNode && onRemovePendingOperation && (
            <div className="flex flex-wrap gap-1 mt-1">
              {getPendingOperationsForNode(node.id).map((op: any) => (
                <span key={op.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                  {op.quantity} de {op.stockItem.nome}
                  <button onClick={(e) => { e.stopPropagation(); onRemovePendingOperation(op.id); }} className="ml-1 text-yellow-600 hover:text-yellow-900">✕</button>
                </span>
              ))}
            </div>
          )}

          {node.atendimentoViaCascata && node.atendimentoViaCascata.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.atendimentoViaCascata.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">📦 {c.origemNome}: {c.quantidade}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {node.children!.map(child => (
            <HierarchyNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selectedNodeId={selectedNodeId}
              hoverNodeId={hoverNodeId}
              toggleNode={toggleNode}
              onNodeClick={onNodeClick}
              onNodeDragOver={onNodeDragOver}
              onNodeDrop={onNodeDrop}
              getQuantidadeAtendidaTotal={getQuantidadeAtendidaTotal}
              getPendingOperationsForNode={getPendingOperationsForNode}
              onRemovePendingOperation={onRemovePendingOperation}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export const ProductHierarchyTree: React.FC<ProductHierarchyTreeProps> = ({
  nodes, gruposMontagem, gruposProducao, pedidoId, onNodeClick, onNodeDragOver, onNodeDrop, selectedNodeId, hoverNodeId,
  getQuantidadeAtendidaTotal, getPendingOperationsForNode, onRemovePendingOperation, setHierarquiaCache, showAllStatus = false
}) => {
  // Usar contexto global para estado de expansão
  const { toggleNode: toggleNodeGlobal, expandAll, collapseAll, getExpandedNodes } = useExpansionContext();
  
  // Obter nós expandidos para o pedido atual
  const expandedNodes = getExpandedNodes(pedidoId || '');

  // Algoritmo de construção de hierarquia unificada (montagem + produção)
  const hierarchyNodes = useMemo(() => {
    if (!nodes || nodes.length > 0) {
      return nodes || [];
    }

    if (!gruposMontagem || !pedidoId) {
      return [];
    }

    // Passo 1: Coletar todos os assemblyInstanceId de montagem para lookup O(1)
    const montagemIds = new Set(
      gruposMontagem
        .filter(g => g.pedidoId === pedidoId && g.assemblyInstanceId)
        .map(g => g.assemblyInstanceId)
    );

    // Passo 2: Coletar assemblyInstances dos grupos de produção sem montagem
    const productionOnlyInstances: any[] = [];
    
    if (gruposProducao) {
      gruposProducao.forEach(grupo => {
        const pedidoOrigem = grupo.pedidosOrigem?.find((p: any) => p.pedidoId === pedidoId);
        if (pedidoOrigem?.assemblyInstances) {
          pedidoOrigem.assemblyInstances.forEach((instance: any) => {
            // Apenas se não tiver montagem E não for produto_final
            if (!montagemIds.has(instance.assemblyInstanceId) && 
                instance.targetProductType !== 'produto_final') {
              // Adicionar sourceName do grupo de produção
              productionOnlyInstances.push({
                ...instance,
                sourceName: grupo.sourceName
              });
            }
          });
        }
      });
    }

    // Passo 3: Filtrar grupos de montagem (excluindo produtos finais)
    const filteredMontagemGroups = gruposMontagem.filter(g => 
      g.pedidoId === pedidoId && 
      g.assemblyInstanceId && 
      (showAllStatus || g.targetProductType !== 'produto_final')
    );

    // Passo 4: Criar array unificado de instâncias
    const unifiedInstances = [
      ...filteredMontagemGroups.map(g => ({
        assemblyInstanceId: g.assemblyInstanceId,
        targetProductId: g.targetProductId,
        targetProductType: g.targetProductType,
        targetProductName: g.targetProductName,
        parentKitId: g.parentKitId,
        parentModeloId: g.parentModeloId,
        pedidoId: g.pedidoId
      })),
      ...productionOnlyInstances
    ];

    // Prioridade de tipos para ordenação hierárquica
    const tipoPrioridade = {
      'kit': 1,      // Mais alta prioridade
      'modelo': 2,    // Prioridade média
      'peca': 3,      // Prioridade baixa
      'parte': 4       // Mais baixa (se existir)
    };

    // Passo 5: Ordenar unificado - primeiro por complexidade, depois por tipo
    const sortedInstances = unifiedInstances.sort((a, b) => {
      // 1. Comparar complexidade (nível) primeiro
      const aComplexity = a.assemblyInstanceId.split('-').length;
      const bComplexity = b.assemblyInstanceId.split('-').length;
      
      if (aComplexity !== bComplexity) {
        return aComplexity - bComplexity;
      }
      
      // 2. Mesmo nível: ordenar por tipo (Kit → Modelo → Peça)
      const aPriority = tipoPrioridade[a.targetProductType as keyof typeof tipoPrioridade] || 999;
      const bPriority = tipoPrioridade[b.targetProductType as keyof typeof tipoPrioridade] || 999;
      
      return aPriority - bPriority;
    });

    // Passo 6: Criar Maps para lookup O(1) de grupos
    const montagemByInstanceId = new Map<string, any[]>();
    const producaoByInstanceId = new Map<string, any[]>();

    // Preencher Map de grupos de montagem
    gruposMontagem.forEach(grupo => {
      if (grupo.assemblyInstanceId && grupo.pedidoId === pedidoId) {
        const existing = montagemByInstanceId.get(grupo.assemblyInstanceId!) || [];
        existing.push(grupo);
        montagemByInstanceId.set(grupo.assemblyInstanceId!, existing);
      }
    });

    // Preencher Map de grupos de produção
    if (gruposProducao) {
      gruposProducao.forEach(grupo => {
        const pedidoOrigem = grupo.pedidosOrigem?.find((p: any) => p.pedidoId === pedidoId);
        if (pedidoOrigem?.assemblyInstances) {
          pedidoOrigem.assemblyInstances.forEach((instance: any) => {
            const existing = producaoByInstanceId.get(instance.assemblyInstanceId!) || [];
            existing.push({
              ...grupo,
              assemblyInstance: instance
            });
            producaoByInstanceId.set(instance.assemblyInstanceId!, existing);
          });
        }
      });
    }

    // Função recursiva para agregar jornada
    const agregarJornadaAoNo = (node: ProductHierarchyNode): ProductHierarchyNode => {
      // 1. Obter grupos diretos do próprio nó
      const gruposMontagemDiretos = montagemByInstanceId.get(node.assemblyInstanceId!) || [];
      const gruposProducaoDiretos = producaoByInstanceId.get(node.assemblyInstanceId!) || [];

      // 2. Agregar grupos dos filhos (recursivo)
      const gruposMontagemFilhos = new Set<string>();
      const gruposProducaoFilhos = new Set<string>();

      if (node.children) {
        node.children = node.children.map(filho => {
          const filhoComJornada = agregarJornadaAoNo(filho);
          
          // Agregar IDs dos filhos
          filhoComJornada.jornadaIds?.gruposMontagem.forEach(id => 
            gruposMontagemFilhos.add(id)
          );
          filhoComJornada.jornadaIds?.gruposProducao.forEach(id => 
            gruposProducaoFilhos.add(id)
          );
          
          return filhoComJornada;
        });
      }

      // 3. Combinar diretos + herdados
      const jornadaFinal = {
        gruposMontagem: [
          ...gruposMontagemDiretos.map(g => g.id),
          ...Array.from(gruposMontagemFilhos)
        ],
        gruposProducao: [
          ...gruposProducaoDiretos.map(g => g.id),
          ...Array.from(gruposProducaoFilhos)
        ]
      };

      return {
        ...node,
        jornadaIds: jornadaFinal,
        dadosCompletos: true
      };
    };

    // Construir hierarquia dinamicamente com dados unificados
    const nodeMap = new Map<string, ProductHierarchyNode>();
    const rootNodes: ProductHierarchyNode[] = [];

    sortedInstances.forEach(instance => {
      const parts = instance.assemblyInstanceId.split('-');
      
      // Usar targetProductType direto do documento
      const tipo = (instance.targetProductType as 'kit' | 'modelo' | 'peca' | 'parte') || 'peca';

      const node: ProductHierarchyNode = {
        id: instance.assemblyInstanceId,
        nome: instance.targetProductName || instance.sourceName || `Componente ${parts[parts.length - 2]}`,
        tipo: tipo,
        quantidadeNecessaria: 1,
        quantidadeAtendida: 0,
        nivel: parts.length,
        assemblyInstanceId: instance.assemblyInstanceId,
        targetProductId: instance.targetProductId,
        parentKitId: instance.parentKitId,
        parentModeloId: instance.parentModeloId,
        pedidoId: instance.pedidoId,
        children: []
      };

      nodeMap.set(instance.assemblyInstanceId, node);
    });

    // Passo 7: Estabelecer relações pai-filho baseadas no assemblyInstanceId
    sortedInstances.forEach(instance => {
      const currentNode = nodeMap.get(instance.assemblyInstanceId);
      if (!currentNode) return;

      // Encontrar pai baseado no padrão assemblyInstanceId
      let parentId: string | undefined;
      
      // Remover o último componente (componenteID-instância) para encontrar o pai
      const parts = instance.assemblyInstanceId.split('-');
      if (parts.length > 3) {
        parentId = parts.slice(0, -2).join('-');
        const parentNode = nodeMap.get(parentId!);
          if (parentNode) {
            currentNode.parentId = parentId;
            parentNode.children = parentNode.children || [];
            parentNode.children.push(currentNode);
            
            // Ordenar filhos do parentNode pela mesma lógica hierárquica
            parentNode.children.sort((a, b) => {
              // 1. Manter ordem por complexidade (nível)
              if (a.nivel !== b.nivel) {
                return a.nivel - b.nivel;
              }
              
              // 2. Mesmo nível: ordenar por tipo (Kit → Modelo → Peça)
              const tipoPrioridade = {
                'kit': 1, 'modelo': 2, 'peca': 3, 'parte': 4
              };
              const aPriority = tipoPrioridade[a.tipo] || 999;
              const bPriority = tipoPrioridade[b.tipo] || 999;
              
              return aPriority - bPriority;
            });
          }
      } else {
        // Nó raiz
        rootNodes.push(currentNode);
      }
    });

    // Passo 8: Aplicar agregação de jornada a todos os nós raiz
    const rootNodesComJornada = rootNodes.map(node => agregarJornadaAoNo(node));

    return rootNodesComJornada;
  }, [nodes, gruposMontagem, gruposProducao, pedidoId]);

  // Persistir hierarquia enriquecida no cache (sem dependência do estado de expansão)
  useMemo(() => {
    if (hierarchyNodes.length > 0 && pedidoId && setHierarquiaCache) {
      setHierarquiaCache((prev: any) => ({
        ...prev,
        [pedidoId]: {
          hierarquia: hierarchyNodes, // ✅ COM JORNADA ENRIQUECIDA
          gruposProducao: gruposProducao || [], // ✅ ADICIONAR GRUPOS DE PRODUÇÃO
          gruposMontagem: gruposMontagem || [], // ✅ ADICIONAR GRUPOS DE MONTAGEM
          lastUpdated: Date.now()
        }
      }));
    }
  }, [hierarchyNodes, pedidoId, gruposProducao, gruposMontagem, setHierarquiaCache]);

  // Função wrapper para toggle usando contexto global
  const toggleNode = useCallback((nodeId: string) => {
    if (pedidoId) {
      toggleNodeGlobal(pedidoId, nodeId);
    }
  }, [toggleNodeGlobal, pedidoId]);

  // Função wrapper para expandAll usando contexto global
  const handleExpandAll = useCallback(() => {
    if (pedidoId) {
      const all = new Set<string>();
      const collect = (ns: ProductHierarchyNode[]) => ns.forEach(n => { all.add(n.id); if (n.children) collect(n.children); });
      collect(hierarchyNodes);
      expandAll(pedidoId, Array.from(all));
    }
  }, [expandAll, pedidoId, hierarchyNodes]);

  // Função wrapper para collapseAll usando contexto global
  const handleCollapseAll = useCallback(() => {
    if (pedidoId) {
      collapseAll(pedidoId);
    }
  }, [collapseAll, pedidoId]);

  return (
    <div className="bg-white rounded-lg border-0 border-gray-100">
      <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg flex justify-between items-center">
        <div className="text-sm font-medium text-gray-700">Hierarquia de Produtos ({hierarchyNodes.length} raízes)</div>
        <div className="flex space-x-2">
          <button onClick={handleExpandAll} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50">Expandir</button>
          <button onClick={handleCollapseAll} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50">Colapsar</button>
        </div>
      </div>
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {hierarchyNodes.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500 mb-2">
              <Package className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p className="text-lg font-medium">Nenhum produto pendente de atendimento</p>
              <p className="text-sm text-gray-400 mt-1">
                Todos os itens deste pedido já foram atendidos ou não possuem grupos aguardando montagem.
              </p>
            </div>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Dica:</strong> Itens aparecem aqui quando estão com status "aguardando" ou "aguardando montagem".
              </p>
            </div>
          </div>
        ) : (
          hierarchyNodes.map(node => (
            <HierarchyNode
              key={node.id}
              node={node}
              depth={0}
              expandedNodes={expandedNodes}
              selectedNodeId={selectedNodeId}
              hoverNodeId={hoverNodeId}
              toggleNode={toggleNode}
              onNodeClick={onNodeClick}
              onNodeDragOver={onNodeDragOver}
              onNodeDrop={onNodeDrop}
              getQuantidadeAtendidaTotal={getQuantidadeAtendidaTotal}
              getPendingOperationsForNode={getPendingOperationsForNode}
              onRemovePendingOperation={onRemovePendingOperation}
            />
          ))
        )}
      </div>
    </div>
  );
};
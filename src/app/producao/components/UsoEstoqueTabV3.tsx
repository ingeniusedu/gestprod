import React, { useState, useMemo } from 'react';
import { Search, Filter, ArrowRight, Info, Package, Box, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDragAndDropStockV3 } from '../../hooks/useDragAndDropStockV3';
import { PedidoCardCompacto } from './PedidoCardCompacto';
import { ProductHierarchyTree } from './ProductHierarchyTree';
import { ComponentJourneyCard } from './ComponentJourneyCard';
import { StockForPedido } from './StockForPedido';
import { PendingOperationsPanel } from './PendingOperationsPanel';
import type { ProductHierarchyNode } from './ProductHierarchyTree';

export const UsoEstoqueTabV3 = () => {
  const {
    pedidosIniciais,
    hierarquiaCache,
    setHierarquiaCache,
    stockItems,
    selectedPedidoId,
    isLoading,
    pendingOperations,
    setSelectedPedidoId,
    getStockForSelectedPedido,
    calculateCascadeScope,
    handleDrop,
    removePendingOperation,
    clearPendingOperations,
    confirmStockUsage,
    getPedidoSelecionado,
    parseAssemblyInstanceId,
    getQuantidadeAtendidaTotal,
    getPendingOperationsForNode,
    enrichNodeWithJourney
  } = useDragAndDropStockV3();

  const [draggingItem, setDraggingItem] = useState<any>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [showCascadePreview, setShowCascadePreview] = useState(false);
  const [cascadeScope, setCascadeScope] = useState<ProductHierarchyNode[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showJourneyDetails, setShowJourneyDetails] = useState<string | null>(null);

  const handleDragStart = (item: any) => setDraggingItem(item);
  const handleDragEnd = () => { setDraggingItem(null); setHoverNodeId(null); setShowCascadePreview(false); };

  const handleNodeDragOver = (node: ProductHierarchyNode) => {
    setHoverNodeId(node.id);
    if (draggingItem) {
      const scope = calculateCascadeScope(draggingItem, node);
      setCascadeScope(scope);
      setShowCascadePreview(true);
    }
  };

  const handleNodeDrop = async (node: ProductHierarchyNode) => {
    if (!draggingItem || !selectedPedidoId) return;
    try {
      const operation = handleDrop(draggingItem, node, selectedPedidoId);
      toast.success(`Operação adicionada: ${draggingItem.nome} → ${node.nome}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro no drop');
    } finally {
      handleDragEnd();
    }
  };

  const handleNodeClick = (node: ProductHierarchyNode) => {
    setSelectedNodeId(node.id);
    setShowJourneyDetails(node.assemblyInstanceId || null);
    
    // Dados já estão pré-populados pela agregação durante construção da hierarquia
    // Não é necessário enriquecimento posterior
  };

  const pedidosOrdenados = useMemo(() => 
    [...pedidosIniciais]
      .filter(pedido => {
        if (searchTerm && !pedido.numero.toString().toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filterStatus !== 'todos' && pedido.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => (a.numero || 0) - (b.numero || 0))
  , [pedidosIniciais, searchTerm, filterStatus]);

  const pedidoSelecionado = getPedidoSelecionado();
  const stockFiltrado = getStockForSelectedPedido();

  // Usar hierarquia do cache em vez de pedidoSelecionado.hierarquia (que está vazio)
  const hierarquiaDoCache = useMemo(() => {
    if (!pedidoSelecionado) return [];
    
    // Tentar ambas as chaves para identificar qual funciona
    const cacheById = hierarquiaCache[selectedPedidoId || ''];
    const cacheByPedidoId = hierarquiaCache[pedidoSelecionado.pedido?.id || ''];
    
    // Usar a que funcionar (priorizar cacheById)
    const cacheEntry = cacheById || cacheByPedidoId;
    
    return cacheEntry?.hierarquia || [];
  }, [pedidoSelecionado, hierarquiaCache, selectedPedidoId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !hierarquiaDoCache.length) {
      return null;
    }
    
    const findNode = (nodes: ProductHierarchyNode[]): ProductHierarchyNode | null => {
      for (const n of nodes) {
        if (n.id === selectedNodeId) {
          return n;
        }
        if (n.children) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    return findNode(hierarquiaDoCache);
  }, [selectedNodeId, hierarquiaDoCache]);

  const handleConfirmStockUsage = async () => {
    if (!selectedPedidoId || pendingOperations.length === 0) return;
    setIsConfirming(true);
    try {
      const result = await confirmStockUsage(selectedPedidoId);
      if (result.success) {
        toast.success(`Confirmado: ${result.message}`);
        setSelectedNodeId(null);
        setShowJourneyDetails(null);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Erro na confirmação');
    } finally {
      setIsConfirming(false);
    }
  };

  const getIconForType = (tipo: string) => {
    switch(tipo) {
      case 'kit': return <Package className="h-4 w-4" />;
      case 'modelo': return <Box className="h-4 w-4" />;
      case 'peca': return <Box className="h-4 w-4" />;
      case 'parte': return <Square className="h-4 w-4" />;
      default: return <Box className="h-4 w-4" />;
    }
  };

  const getColorForType = (tipo: string) => {
    switch(tipo) {
      case 'kit': return 'bg-purple-100 text-purple-800';
      case 'modelo': return 'bg-blue-100 text-blue-800';
      case 'peca': return 'bg-green-100 text-green-800';
      case 'parte': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Estoque (V3)</h1>
        <p className="text-gray-700">Otimizado para performance e atendimento em cascata.</p>
      </div>

      <PendingOperationsPanel
        operations={pendingOperations}
        onRemoveOperation={removePendingOperation}
        onClearAll={clearPendingOperations}
        onConfirm={handleConfirmStockUsage}
                pedidoNumero={pedidoSelecionado?.pedido?.numero || 'N/A'}
        isLoading={isConfirming}
      />

      <div className="bg-white shadow rounded-lg p-4 flex space-x-4">
        <input type="text" placeholder="Buscar pedido..." className="flex-1 p-2 border rounded" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <select className="p-2 border rounded" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="aguardando">Aguardando</option>
          <option value="em_producao">Produção</option>
        </select>
      </div>

      {/* Cards de Pedidos Horizontais */}
      <div className="flex flex-wrap gap-2 mb-6">
        {pedidosOrdenados.map(p => (
          <PedidoCardCompacto 
            key={p.id} 
            pedido={p} 
            isSelected={selectedPedidoId === p.id} 
            onClick={() => setSelectedPedidoId(p.id)} 
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {pedidoSelecionado ? (
          <>
            <div className="lg:col-span-2 space-y-4">
              {/* Título do Pedido - Fora do card */}
              <div className="mb-2">
                <h2 className="text-2xl font-bold text-gray-900">Pedido #{pedidoSelecionado?.pedido?.numero || pedidosIniciais.find(p => p.id === selectedPedidoId)?.numero || 'N/A'}</h2>
              </div>
              
              {/* Card de Hierarquia - Simplificado e flutuante */}
              <div className="bg-white shadow-sm rounded-lg p-6 border-0 border-gray-100">
                <ProductHierarchyTree
                  nodes={pedidoSelecionado.hierarquia}
                  gruposMontagem={pedidoSelecionado.gruposMontagem}
                  gruposProducao={pedidoSelecionado.gruposProducao}
                  pedidoId={selectedPedidoId || undefined}
                  onNodeDragOver={handleNodeDragOver}
                  onNodeDrop={handleNodeDrop}
                  onNodeClick={handleNodeClick}
                  selectedNodeId={selectedNodeId || undefined}
                  hoverNodeId={hoverNodeId || undefined}
                  getQuantidadeAtendidaTotal={getQuantidadeAtendidaTotal}
                  getPendingOperationsForNode={getPendingOperationsForNode}
                  onRemovePendingOperation={removePendingOperation}
                  setHierarquiaCache={setHierarquiaCache}
                />
                {showCascadePreview && cascadeScope.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                    <strong>Cascata:</strong> {cascadeScope.map(n => n.nome).join(', ')}
                  </div>
                )}
              </div>

              {selectedNode && (
                <ComponentJourneyCard 
                  node={selectedNode} 
                  allProductionGroups={hierarquiaCache[selectedPedidoId || '']?.gruposProducao || []}
                  allGroups={hierarquiaCache[selectedPedidoId || '']?.gruposMontagem || []}
                />
              )}
            </div>

            <div className="lg:col-span-1">
              <StockForPedido stockItems={stockFiltrado} onDragStart={handleDragStart} onDragEnd={handleDragEnd} draggingItemId={draggingItem?.id} pedidoId={selectedPedidoId || undefined} />
            </div>
          </>
        ) : (
          <div className="lg:col-span-2 bg-gray-50 rounded-lg p-12 text-center text-gray-500">Selecione um pedido para começar</div>
        )}
      </div>
    </div>
  );
};

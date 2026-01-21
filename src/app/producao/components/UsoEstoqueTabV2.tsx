import React, { useState } from 'react';
import { Search, Filter, ArrowRight, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDragAndDropStockV2 } from '../../hooks/useDragAndDropStockV2';
import { PedidoCard } from './PedidoCard';
import { ProductHierarchyTree } from './ProductHierarchyTree';
import { StockForPedido } from './StockForPedido';
import { PendingOperationsPanel } from './PendingOperationsPanel';
import type { ProductHierarchyNode } from '../../hooks/useDragAndDropStockV2';

export const UsoEstoqueTabV2 = () => {
  const {
    pedidosComHierarquia,
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
    getPendingOperationsForNode,
    getQuantidadeAtendidaTotal: getQuantidadeAtendidaTotalHook
  } = useDragAndDropStockV2();

  const [draggingItem, setDraggingItem] = useState<any>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [showCascadePreview, setShowCascadePreview] = useState(false);
  const [cascadeScope, setCascadeScope] = useState<ProductHierarchyNode[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleDragStart = (item: any) => {
    setDraggingItem(item);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setHoverNodeId(null);
    setShowCascadePreview(false);
  };

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
      toast.success(`Operação adicionada à lista de pendentes: ${draggingItem.nome} → ${node.nome} (${operation.quantity} unidades)`);
      console.log('Drop realizado - operação pendente adicionada:', operation);
      
    } catch (error) {
      console.error('Erro ao processar drop:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar operação pendente');
    } finally {
      handleDragEnd();
    }
  };

  const handleNodeClick = (node: ProductHierarchyNode) => {
    setSelectedNodeId(node.id);
    // Pode adicionar mais lógica aqui, como mostrar detalhes do nó
  };

  // Filtrar pedidos
  const filteredPedidos = pedidosComHierarquia.filter(pedidoComHierarquia => {
    const { pedido } = pedidoComHierarquia;
    
    // Filtro por busca
    if (searchTerm && !pedido.numero.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // Filtro por status
    if (filterStatus !== 'todos' && pedido.status !== filterStatus) {
      return false;
    }
    
    return true;
  });

  const pedidoSelecionado = getPedidoSelecionado();
  const stockFiltrado = getStockForSelectedPedido();

  // Função para confirmar uso de estoque
  const handleConfirmStockUsage = async () => {
    if (!selectedPedidoId || pendingOperations.length === 0) return;

    setIsConfirming(true);
    try {
      const result = await confirmStockUsage(selectedPedidoId);
      
      if (result.success) {
        toast.success(`Uso de estoque confirmado! ${result.message}`);
        // Limpar estado visual
        setDraggingItem(null);
        setHoverNodeId(null);
        setSelectedNodeId(null);
        setShowCascadePreview(false);
        setCascadeScope([]);
      } else {
        toast.error(`Erro ao confirmar uso de estoque: ${result.message}`);
      }
    } catch (error) {
      console.error('Erro ao confirmar uso de estoque:', error);
      toast.error('Erro ao processar confirmação de uso de estoque');
    } finally {
      setIsConfirming(false);
    }
  };

  // Função para remover operação pendente
  const handleRemovePendingOperation = (operationId: string) => {
    removePendingOperation(operationId);
    toast.success('Operação removida da lista de pendentes');
  };

  // Função para limpar todas as operações pendentes
  const handleClearAllPendingOperations = () => {
    clearPendingOperations();
    toast.success('Todas as operações pendentes foram removidas');
  };

  // Função para calcular quantidade atendida total (incluindo pendente)
  const getQuantidadeAtendidaTotal = (node: ProductHierarchyNode): number => {
    // Usar a função do hook que já considera operações pendentes
    return getQuantidadeAtendidaTotalHook ? getQuantidadeAtendidaTotalHook(node) : node.quantidadeAtendida;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dados de pedidos e estoque...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Gestão de Estoque por Pedido</h1>
        <p className="text-gray-700">
          Selecione um pedido para gerenciar o uso de estoque. Arraste itens do estoque para os produtos na hierarquia.
        </p>
        <div className="mt-4 flex items-center space-x-4 text-sm text-blue-800">
          <Info className="h-5 w-5" />
          <span>O sistema mapeia automaticamente grupos de produção e montagem para atualização</span>
        </div>
      </div>

      {/* Painel de Operações Pendentes */}
      <PendingOperationsPanel
        operations={pendingOperations}
        onRemoveOperation={handleRemovePendingOperation}
        onClearAll={handleClearAllPendingOperations}
        onConfirm={handleConfirmStockUsage}
        pedidoNumero={pedidoSelecionado?.pedido.numero}
        isLoading={isConfirming}
      />

      {/* Filtros */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número do pedido..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Filter className="h-5 w-5 text-gray-500" />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="aguardando">Aguardando</option>
              <option value="em_producao">Em Produção</option>
              <option value="concluido">Concluído</option>
            </select>
            
            <div className="text-sm text-gray-600">
              {filteredPedidos.length} pedido{filteredPedidos.length !== 1 ? 's' : ''} encontrado{filteredPedidos.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Pedidos */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pedidos</h2>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {filteredPedidos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nenhum pedido encontrado
                </div>
              ) : (
                filteredPedidos.map(({ pedido }) => {
                  // Calcular progresso (simplificado)
                  const progresso = {
                    totalProdutos: pedido.produtos.length,
                    produtosAtendidos: Math.floor(pedido.produtos.length * 0.3), // Exemplo
                    progressoPercentual: 30 // Exemplo
                  };

                  return (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      isSelected={selectedPedidoId === pedido.id}
                      onClick={() => setSelectedPedidoId(pedido.id)}
                      progresso={progresso}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Colunas 2 e 3: Detalhes do Pedido Selecionado */}
        {pedidoSelecionado ? (
          <>
            {/* Coluna 2: Hierarquia do Pedido */}
            <div className="lg:col-span-2">
              <div className="space-y-6">
                {/* Cabeçalho do Pedido Selecionado */}
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Pedido #{pedidoSelecionado.pedido.numero}
                      </h2>
                      <p className="text-gray-600">
                        {pedidoSelecionado.pedido.produtos.length} produto{pedidoSelecionado.pedido.produtos.length !== 1 ? 's' : ''} • 
                        Status: <span className="font-semibold">{pedidoSelecionado.pedido.status}</span>
                      </p>
                    </div>
                    <div className="text-sm text-gray-500">
                      {pedidoSelecionado.gruposMontagem.length} grupo{pedidoSelecionado.gruposMontagem.length !== 1 ? 's' : ''} de montagem
                    </div>
                  </div>
                </div>

                {/* Hierarquia de Produtos */}
                <ProductHierarchyTree
                  nodes={pedidoSelecionado.hierarquia}
                  onNodeClick={handleNodeClick}
                  onNodeDragOver={handleNodeDragOver}
                  onNodeDrop={handleNodeDrop}
                  selectedNodeId={selectedNodeId || undefined}
                  hoverNodeId={hoverNodeId || undefined}
                  getQuantidadeAtendidaTotal={getQuantidadeAtendidaTotal}
                  getPendingOperationsForNode={getPendingOperationsForNode}
                  onRemovePendingOperation={handleRemovePendingOperation}
                />

                {/* Preview de Cascata */}
                {showCascadePreview && cascadeScope.length > 1 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <ArrowRight className="h-5 w-5 text-yellow-600 mr-2" />
                      <h3 className="font-semibold text-yellow-800">Cascata será aplicada para:</h3>
                    </div>
                    <div className="text-sm text-yellow-700">
                      <ul className="list-disc list-inside space-y-1">
                        {cascadeScope.slice(0, 5).map((item, idx) => (
                          <li key={idx}>
                            {item.nome} ({item.tipo}) - {item.quantidadeNecessaria} necessário{item.quantidadeNecessaria !== 1 ? 's' : ''}
                          </li>
                        ))}
                        {cascadeScope.length > 5 && (
                          <li>...e mais {cascadeScope.length - 5} itens</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 3: Estoque para o Pedido */}
            <div className="lg:col-span-3 lg:col-start-3">
              <StockForPedido
                stockItems={stockFiltrado}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                draggingItemId={draggingItem?.id}
                pedidoId={pedidoSelecionado.pedido.id}
                pedidoNumero={pedidoSelecionado.pedido.numero}
              />
            </div>
          </>
        ) : (
          /* Placeholder quando nenhum pedido está selecionado */
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ArrowRight className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Selecione um pedido
                </h3>
                <p className="text-gray-600">
                  Clique em um pedido na lista à esquerda para visualizar sua hierarquia de produtos 
                  e gerenciar o uso de estoque.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Área de drop global (feedback visual) */}
      {draggingItem && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white shadow-lg border border-gray-300 rounded-lg p-4 z-50 min-w-[300px]">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded ${
              draggingItem.tipo === 'kit' ? 'bg-purple-100' :
              draggingItem.tipo === 'modelo' ? 'bg-blue-100' :
              draggingItem.tipo === 'peca' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {draggingItem.tipo === 'kit' ? '📦' :
               draggingItem.tipo === 'modelo' ? '📦' :
               draggingItem.tipo === 'peca' ? '⬛' : '🧩'}
            </div>
            <div>
              <div className="font-medium">Arrastando: {draggingItem.nome}</div>
              <div className="text-sm text-gray-600">
                Solte em um item da hierarquia para atender
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Informações sobre mapeamento */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Mapeamento Automático:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center mb-2">
              <div className="h-3 w-3 rounded-full bg-blue-500 mr-2"></div>
              <span className="font-medium">Grupos de Produção</span>
            </div>
            <p className="text-sm text-gray-600">
              Partes consumidas do estoque atualizam automaticamente os grupos de produção otimizados
            </p>
          </div>
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center mb-2">
              <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
              <span className="font-medium">Grupos de Montagem</span>
            </div>
            <p className="text-sm text-gray-600">
              Peças, modelos e kits consumidos atualizam os grupos de montagem correspondentes
            </p>
          </div>
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center mb-2">
              <div className="h-3 w-3 rounded-full bg-purple-500 mr-2"></div>
              <span className="font-medium">Cascata Automática</span>
            </div>
            <p className="text-sm text-gray-600">
              O sistema aplica cascata conforme o tipo (Kit→Kit, Modelo→Modelo, etc.)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

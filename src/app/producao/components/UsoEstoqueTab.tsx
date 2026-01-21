import React, { useState } from 'react';
import { Package, Box, Square, Layers, ArrowRight } from 'lucide-react';
import { useDragAndDropStock } from '../../hooks/useDragAndDropStock';

interface DragItem {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca';
  quantidade: number;
  produtoId: string;
}

interface DropTarget {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca';
  quantidadeNecessaria: number;
  quantidadeAtendida: number;
  assemblyInstanceId?: string;
  children?: DropTarget[];
  parentId?: string;
}

export const UsoEstoqueTab = () => {
  const {
    stockItems,
    orderHierarchy,
    isLoading,
    handleDrop,
    calculateCascadeScope
  } = useDragAndDropStock();

  const [draggingItem, setDraggingItem] = useState<DragItem | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [showCascadePreview, setShowCascadePreview] = useState(false);
  const [cascadeScope, setCascadeScope] = useState<DropTarget[]>([]);

  const handleDragStart = (item: DragItem) => {
    setDraggingItem(item);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setHoverTarget(null);
    setShowCascadePreview(false);
  };

  const handleDragOver = (targetId: string, targetItem: DropTarget) => {
    setHoverTarget(targetId);
    
    if (draggingItem) {
      const scope = calculateCascadeScope(draggingItem, targetItem);
      setCascadeScope(scope);
      setShowCascadePreview(true);
    }
  };

  const handleDropOnTarget = async (targetItem: DropTarget) => {
    if (!draggingItem) return;

    try {
      await handleDrop(draggingItem, targetItem);
      // TODO: Mostrar feedback de sucesso
    } catch (error) {
      console.error('Erro ao processar drop:', error);
      // TODO: Mostrar feedback de erro
    } finally {
      handleDragEnd();
    }
  };

  const getIconForType = (tipo: string) => {
    switch (tipo) {
      case 'kit': return <Package className="h-5 w-5" />;
      case 'modelo': return <Box className="h-5 w-5" />;
      case 'peca': return <Square className="h-5 w-5" />;
      default: return <Layers className="h-5 w-5" />;
    }
  };

  const getColorForType = (tipo: string) => {
    switch (tipo) {
      case 'kit': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'modelo': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'peca': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Carregando dados de estoque e pedidos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">Como usar:</h3>
        <ul className="list-disc list-inside text-blue-700 space-y-1">
          <li>Arraste itens do estoque (lado esquerdo) para os pedidos (lado direito)</li>
          <li>Kit → Kit: Atende o kit e todos os seus componentes</li>
          <li>Modelo → Modelo: Atende o modelo e suas peças</li>
          <li>Peça → Peça: Atende apenas a peça específica</li>
          <li>O sistema aplicará cascata automaticamente conforme o tipo</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna de Estoque */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Package className="h-6 w-6 mr-2 text-green-600" />
            Estoque Disponível
          </h2>
          
          <div className="space-y-3">
            {stockItems.length > 0 ? (
              stockItems.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-3 border rounded-lg cursor-move hover:shadow-md transition-shadow ${getColorForType(item.tipo)}`}
                >
                  <div className="flex items-center space-x-3">
                    {getIconForType(item.tipo)}
                    <div>
                      <div className="font-medium">{item.nome}</div>
                      <div className="text-sm opacity-75">Quantidade: {item.quantidade}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {item.tipo.toUpperCase()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                Nenhum item disponível em estoque
              </div>
            )}
          </div>
        </div>

        {/* Coluna de Pedidos */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <Layers className="h-6 w-6 mr-2 text-blue-600" />
            Pedidos Aguardando
          </h2>
          
          <div className="space-y-4">
            {orderHierarchy.length > 0 ? (
              orderHierarchy.map(item => (
                <div key={item.id} className="space-y-2">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      handleDragOver(item.id, item);
                    }}
                    onDragLeave={() => setHoverTarget(null)}
                    onDrop={() => handleDropOnTarget(item)}
                    className={`p-3 border rounded-lg transition-all ${hoverTarget === item.id ? 'bg-blue-50 border-blue-400' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getIconForType(item.tipo)}
                        <div>
                          <div className="font-medium">{item.nome}</div>
                          <div className="text-sm text-gray-600">
                            Necessário: {item.quantidadeNecessaria} | Atendido: {item.quantidadeAtendida}
                          </div>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-semibold ${getColorForType(item.tipo)}`}>
                        {item.tipo.toUpperCase()}
                      </div>
                    </div>

                    {/* Preview de cascata */}
                    {showCascadePreview && hoverTarget === item.id && cascadeScope.length > 1 && (
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                        <div className="font-semibold text-yellow-800 mb-1">
                          <ArrowRight className="h-4 w-4 inline mr-1" />
                          Cascata será aplicada para:
                        </div>
                        <ul className="list-disc list-inside text-yellow-700">
                          {cascadeScope.slice(0, 3).map((scopeItem, idx) => (
                            <li key={idx}>{scopeItem.nome} ({scopeItem.tipo})</li>
                          ))}
                          {cascadeScope.length > 3 && (
                            <li>...e mais {cascadeScope.length - 3} itens</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Filhos (se houver) */}
                  {item.children && item.children.length > 0 && (
                    <div className="ml-6 space-y-2">
                      {item.children.map(child => (
                        <div
                          key={child.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            handleDragOver(child.id, child);
                          }}
                          onDragLeave={() => setHoverTarget(null)}
                          onDrop={() => handleDropOnTarget(child)}
                          className={`p-2 border rounded transition-all ${hoverTarget === child.id ? 'bg-blue-50 border-blue-400' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {getIconForType(child.tipo)}
                              <div className="text-sm">
                                <div>{child.nome}</div>
                                <div className="text-xs text-gray-500">
                                  {child.quantidadeNecessaria} necessário | {child.quantidadeAtendida} atendido
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                Nenhum pedido aguardando atendimento
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Área de drop global */}
      {draggingItem && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white shadow-lg border border-gray-300 rounded-lg p-4 z-50">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded ${getColorForType(draggingItem.tipo)}`}>
              {getIconForType(draggingItem.tipo)}
            </div>
            <div>
              <div className="font-medium">Arrastando: {draggingItem.nome}</div>
              <div className="text-sm text-gray-600">Solte em um item do pedido para atender</div>
            </div>
          </div>
        </div>
      )}

      {/* Instruções */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Regras de cascata:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center mb-2">
              <Package className="h-5 w-5 mr-2 text-purple-600" />
              <span className="font-medium">Kit → Kit</span>
            </div>
            <p className="text-sm text-gray-600">
              Atende o kit e todos os seus modelos e peças componentes
            </p>
          </div>
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center mb-2">
              <Box className="h-5 w-5 mr-2 text-blue-600" />
              <span className="font-medium">Modelo → Modelo</span>
            </div>
            <p className="text-sm text-gray-600">
              Atende o modelo e todas as suas peças componentes
            </p>
          </div>
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center mb-2">
              <Square className="h-5 w-5 mr-2 text-green-600" />
              <span className="font-medium">Peça → Peça</span>
            </div>
            <p className="text-sm text-gray-600">
              Atende apenas a peça específica, sem cascata
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

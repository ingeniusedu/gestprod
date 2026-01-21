import React from 'react';
import { Package, Box, Square, Layers, ArrowRight, Info } from 'lucide-react';

interface StockItem {
  id: string;
  nome: string;
  tipo: 'kit' | 'modelo' | 'peca' | 'parte';
  quantidade: number;
  produtoId: string;
  posicoesEstoque?: any[];
}

interface StockForPedidoProps {
  stockItems: StockItem[];
  onDragStart: (item: StockItem) => void;
  onDragEnd: () => void;
  draggingItemId?: string;
  pedidoId?: string;
  pedidoNumero?: string;
}

export const StockForPedido: React.FC<StockForPedidoProps> = ({
  stockItems,
  onDragStart,
  onDragEnd,
  draggingItemId,
  pedidoId,
  pedidoNumero
}) => {
  const getIconForType = (tipo: string) => {
    switch (tipo) {
      case 'kit':
        return <Package className="h-5 w-5 text-purple-600" />;
      case 'modelo':
        return <Box className="h-5 w-5 text-blue-600" />;
      case 'peca':
        return <Square className="h-5 w-5 text-green-600" />;
      case 'parte':
        return <Layers className="h-5 w-5 text-gray-600" />;
      default:
        return <Layers className="h-5 w-5" />;
    }
  };

  const getColorForType = (tipo: string) => {
    switch (tipo) {
      case 'kit':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'modelo':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'peca':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'parte':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const groupByType = () => {
    const grouped: Record<string, StockItem[]> = {
      kit: [],
      modelo: [],
      peca: [],
      parte: []
    };

    stockItems.forEach(item => {
      if (grouped[item.tipo]) {
        grouped[item.tipo].push(item);
      }
    });

    return grouped;
  };

  const groupedStock = groupByType();
  const totalItems = stockItems.length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Cabeçalho */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Package className="h-5 w-5 mr-2 text-green-600" />
              Estoque Disponível
            </h3>
            {pedidoId && (
              <p className="text-sm text-gray-600 mt-1">
                Filtrado para o pedido #{pedidoNumero || pedidoId}
              </p>
            )}
          </div>
          <div className="text-sm text-gray-600">
            {totalItems} item{totalItems !== 1 ? 's' : ''} disponível{totalItems !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-4">
        {totalItems === 0 ? (
          <div className="text-center py-8">
            <Info className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">Nenhum item em estoque disponível para este pedido</p>
            <p className="text-sm text-gray-500 mt-1">
              O estoque será filtrado automaticamente para mostrar apenas itens relevantes
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Kits */}
            {groupedStock.kit.length > 0 && (
              <div>
                <div className="flex items-center mb-3">
                  <Package className="h-5 w-5 mr-2 text-purple-600" />
                  <h4 className="font-medium text-gray-900">Kits</h4>
                  <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                    {groupedStock.kit.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupedStock.kit.map(item => (
                    <StockItemCard
                      key={item.id}
                      item={item}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      isDragging={draggingItemId === item.id}
                      getIconForType={getIconForType}
                      getColorForType={getColorForType}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Modelos */}
            {groupedStock.modelo.length > 0 && (
              <div>
                <div className="flex items-center mb-3">
                  <Box className="h-5 w-5 mr-2 text-blue-600" />
                  <h4 className="font-medium text-gray-900">Modelos</h4>
                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {groupedStock.modelo.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupedStock.modelo.map(item => (
                    <StockItemCard
                      key={item.id}
                      item={item}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      isDragging={draggingItemId === item.id}
                      getIconForType={getIconForType}
                      getColorForType={getColorForType}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Peças */}
            {groupedStock.peca.length > 0 && (
              <div>
                <div className="flex items-center mb-3">
                  <Square className="h-5 w-5 mr-2 text-green-600" />
                  <h4 className="font-medium text-gray-900">Peças</h4>
                  <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    {groupedStock.peca.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupedStock.peca.map(item => (
                    <StockItemCard
                      key={item.id}
                      item={item}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      isDragging={draggingItemId === item.id}
                      getIconForType={getIconForType}
                      getColorForType={getColorForType}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Partes */}
            {groupedStock.parte.length > 0 && (
              <div>
                <div className="flex items-center mb-3">
                  <Layers className="h-5 w-5 mr-2 text-gray-600" />
                  <h4 className="font-medium text-gray-900">Partes</h4>
                  <span className="ml-2 text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                    {groupedStock.parte.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupedStock.parte.map(item => (
                    <StockItemCard
                      key={item.id}
                      item={item}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      isDragging={draggingItemId === item.id}
                      getIconForType={getIconForType}
                      getColorForType={getColorForType}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="p-4 border-t border-gray-200 bg-blue-50 rounded-b-lg">
        <div className="flex items-start">
          <ArrowRight className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Como usar:</p>
            <p className="text-sm text-blue-700">
              Arraste os itens do estoque para os produtos na hierarquia do pedido.
              O sistema aplicará cascata automaticamente conforme o tipo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StockItemCardProps {
  item: StockItem;
  onDragStart: (item: StockItem) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  getIconForType: (tipo: string) => React.ReactNode;
  getColorForType: (tipo: string) => string;
}

const StockItemCard: React.FC<StockItemCardProps> = ({
  item,
  onDragStart,
  onDragEnd,
  isDragging,
  getIconForType,
  getColorForType
}) => {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item)}
      onDragEnd={onDragEnd}
      className={`flex items-center justify-between p-3 border rounded-lg cursor-move transition-all ${
        isDragging 
          ? 'opacity-50 scale-95 shadow-lg' 
          : 'hover:shadow-md hover:scale-[1.02]'
      } ${getColorForType(item.tipo)}`}
    >
      <div className="flex items-center space-x-3">
        {getIconForType(item.tipo)}
        <div>
          <div className="font-medium">{item.nome}</div>
          <div className="text-sm opacity-75">
            Quantidade: <span className="font-semibold">{item.quantidade}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <div className="text-sm font-semibold uppercase">
          {item.tipo}
        </div>
        {item.posicoesEstoque && item.posicoesEstoque.length > 0 && (
          <div className="text-xs text-gray-600 mt-1">
            {item.posicoesEstoque.length} local{item.posicoesEstoque.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

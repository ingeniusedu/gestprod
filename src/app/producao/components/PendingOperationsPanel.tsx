import React from 'react';
import { X, Check, AlertCircle, Package, Box, Puzzle } from 'lucide-react';
import { PendingOperation } from '../../hooks/useDragAndDropStockV3';

interface PendingOperationsPanelProps {
  operations: PendingOperation[];
  onRemoveOperation: (operationId: string) => void;
  onClearAll: () => void;
  onConfirm: () => void;
  pedidoNumero?: string;
  isLoading?: boolean;
}

export const PendingOperationsPanel: React.FC<PendingOperationsPanelProps> = ({
  operations,
  onRemoveOperation,
  onClearAll,
  onConfirm,
  pedidoNumero,
  isLoading = false
}) => {
  if (operations.length === 0) {
    return null;
  }

  const getIconForType = (type: string) => {
    switch (type) {
      case 'kit': return <Package className="h-5 w-5" />;
      case 'modelo': return <Package className="h-5 w-5" />; // Usando Package para modelo
      case 'peca': return <Box className="h-5 w-5" />;
      case 'parte': return <Puzzle className="h-5 w-5" />;
      default: return <Package className="h-5 w-5" />;
    }
  };

  const getColorForType = (type: string) => {
    switch (type) {
      case 'kit': return 'bg-purple-100 text-purple-800';
      case 'modelo': return 'bg-blue-100 text-blue-800';
      case 'peca': return 'bg-green-100 text-green-800';
      case 'parte': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const calculateTotalQuantity = () => {
    return operations.reduce((sum, op) => sum + op.quantity, 0);
  };

  const getUniqueTargets = () => {
    const targets = new Set<string>();
    operations.forEach(op => {
      targets.add(`${op.targetNode.nome} (${op.targetNode.tipo})`);
    });
    return Array.from(targets);
  };

  return (
    <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Operações Pendentes de Uso de Estoque
          </h3>
          <p className="text-sm text-gray-600">
            {pedidoNumero ? `Pedido #${pedidoNumero}` : 'Selecione um pedido'} • 
            {operations.length} operaç{operations.length === 1 ? 'ão' : 'ões'} pendente{operations.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onClearAll}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            Limpar Todas
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={operations.length === 0 || isLoading}
          >
            <Check className="h-5 w-5 mr-2" />
            Confirmar Uso de Estoque
          </button>
        </div>
      </div>

      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Atenção: Operações em modo de confirmação</p>
            <p>As operações abaixo serão processadas apenas quando você clicar em "Confirmar Uso de Estoque".</p>
            <p className="mt-1">Total a ser consumido: <span className="font-bold">{calculateTotalQuantity()} unidade{calculateTotalQuantity() !== 1 ? 's' : ''}</span></p>
          </div>
        </div>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
        {operations.map((operation) => (
          <div 
            key={operation.id}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  <div className={`p-2 rounded-full mr-3 ${getColorForType(operation.stockItem.tipo)}`}>
                    {getIconForType(operation.stockItem.tipo)}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {operation.stockItem.nome} → {operation.targetNode.nome}
                    </h4>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                      <span className="inline-flex items-center">
                        <div className={`h-2 w-2 rounded-full mr-1 ${
                          operation.stockItem.tipo === 'kit' ? 'bg-purple-500' :
                          operation.stockItem.tipo === 'modelo' ? 'bg-blue-500' :
                          operation.stockItem.tipo === 'peca' ? 'bg-green-500' : 'bg-yellow-500'
                        }`}></div>
                        {operation.stockItem.tipo} → {operation.targetNode.tipo}
                      </span>
                      <span>Quantidade: {operation.quantity}</span>
                      <span>Hora: {formatTime(operation.timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Escopo de Cascata */}
                {operation.cascadeScope.length > 1 && (
                  <div className="ml-11 mt-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      Escopo de cascata ({operation.cascadeScope.length} itens):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {operation.cascadeScope.slice(0, 5).map((item, idx) => (
                        <span 
                          key={idx}
                          className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-700"
                        >
                          {item.nome} ({item.tipo})
                        </span>
                      ))}
                      {operation.cascadeScope.length > 5 && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-600">
                          +{operation.cascadeScope.length - 5} mais
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => onRemoveOperation(operation.id)}
                className="ml-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                disabled={isLoading}
                title="Remover operação"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Resumo */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Total de Operações</div>
            <div className="text-2xl font-bold text-gray-900">{operations.length}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Quantidade Total</div>
            <div className="text-2xl font-bold text-gray-900">{calculateTotalQuantity()}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm text-gray-600">Alvos Únicos</div>
            <div className="text-2xl font-bold text-gray-900">{getUniqueTargets().length}</div>
          </div>
        </div>
      </div>

      {/* Instruções */}
      <div className="mt-4 text-sm text-gray-600">
        <p className="font-medium">Próximos passos:</p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li>Revise as operações acima</li>
          <li>Clique em "Confirmar Uso de Estoque" para processar todas as operações</li>
          <li>O sistema atualizará automaticamente os grupos de produção e montagem</li>
          <li>Use "Limpar Todas" para descartar todas as operações pendentes</li>
        </ol>
      </div>
    </div>
  );
};

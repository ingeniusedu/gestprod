import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Package, RefreshCw, Eye, Settings } from 'lucide-react';
import { useStockVerification, StockVerificationResult } from '../hooks/useStockVerification';

interface StockVerificationPanelProps {
  onOrderSelect?: (pedidoId: string) => void;
  onStockDecisionNeeded?: (results: StockVerificationResult[]) => void;
}

const StockVerificationPanel: React.FC<StockVerificationPanelProps> = ({
  onOrderSelect,
  onStockDecisionNeeded
}) => {
  const { state, actions } = useStockVerification();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'with_stock' | 'need_production'>('all');

  // Filtrar resultados baseado no filtro selecionado
  const filteredResults = state.results.filter(result => {
    switch (selectedFilter) {
      case 'with_stock':
        return result.hasAvailableStock;
      case 'need_production':
        return !result.hasAvailableStock || result.stockSummary.productsNeedingProduction > 0;
      default:
        return true;
    }
  });

  // Estatísticas gerais
  const stats = {
    total: state.results.length,
    withStock: state.results.filter(r => r.hasAvailableStock).length,
    needingProduction: state.results.filter(r => !r.hasAvailableStock || r.stockSummary.productsNeedingProduction > 0).length,
    fullyAvailable: state.results.filter(r => r.hasAvailableStock && r.stockSummary.productsNeedingProduction === 0).length
  };

  const getStockLevelColor = (level: string) => {
    switch (level) {
      case 'kit': return 'text-green-600 bg-green-100';
      case 'modelo': return 'text-blue-600 bg-blue-100';
      case 'peca': return 'text-yellow-600 bg-yellow-100';
      case 'parte': return 'text-orange-600 bg-orange-100';
      default: return 'text-red-600 bg-red-100';
    }
  };

  const getStockLevelText = (level: string) => {
    switch (level) {
      case 'kit': return 'Kit Completo';
      case 'modelo': return 'Modelos';
      case 'peca': return 'Peças';
      case 'parte': return 'Partes';
      default: return 'Sem Estoque';
    }
  };

  const handleStockDecisionClick = () => {
    const ordersWithStock = state.results.filter(r => r.hasAvailableStock);
    if (onStockDecisionNeeded && ordersWithStock.length > 0) {
      onStockDecisionNeeded(ordersWithStock);
    }
  };

  if (state.isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center space-x-2">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-gray-600">Verificando estoque dos pedidos...</span>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
        <div className="flex items-center space-x-2 text-red-600 mb-4">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Erro na Verificação de Estoque</span>
        </div>
        <p className="text-red-600 mb-4">{state.error}</p>
        <button
          onClick={actions.refreshData}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-medium text-gray-900">Verificação de Estoque</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">
              {state.lastUpdated && `Atualizado: ${state.lastUpdated.toLocaleTimeString()}`}
            </span>
            <button
              onClick={actions.refreshData}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Total de Pedidos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.withStock}</div>
            <div className="text-sm text-gray-500">Com Estoque</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.needingProduction}</div>
            <div className="text-sm text-gray-500">Precisam Produção</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.fullyAvailable}</div>
            <div className="text-sm text-gray-500">Totalmente Disponíveis</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 py-3 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Filtrar:</span>
          <div className="flex space-x-2">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos ({stats.total})
            </button>
            <button
              onClick={() => setSelectedFilter('with_stock')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedFilter === 'with_stock'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Com Estoque ({stats.withStock})
            </button>
            <button
              onClick={() => setSelectedFilter('need_production')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedFilter === 'need_production'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Precisam Produção ({stats.needingProduction})
            </button>
          </div>
        </div>
      </div>

      {/* Ações */}
      {stats.withStock > 0 && (
        <div className="px-6 py-3 bg-blue-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-blue-700">
                {stats.withStock} pedido(s) com estoque disponível
              </span>
            </div>
            <button
              onClick={handleStockDecisionClick}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              <Settings className="h-4 w-4 inline mr-2" />
              Gerenciar Uso de Estoque
            </button>
          </div>
        </div>
      )}

      {/* Lista de Pedidos */}
      <div className="max-h-96 overflow-y-auto">
        {filteredResults.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhum pedido encontrado com os filtros selecionados.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredResults.map((result) => (
              <div key={result.pedidoId} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {result.hasAvailableStock ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <Clock className="h-5 w-5 text-orange-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            Pedido {result.pedidoNumero}
                          </p>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStockLevelColor(result.stockLevel)}`}>
                            {getStockLevelText(result.stockLevel)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {result.comprador}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-xs text-gray-400">
                            {result.stockSummary.totalProducts} produto(s)
                          </span>
                          {result.stockSummary.productsWithStock > 0 && (
                            <span className="text-xs text-green-600">
                              {result.stockSummary.productsWithStock} com estoque
                            </span>
                          )}
                          {result.stockSummary.productsNeedingProduction > 0 && (
                            <span className="text-xs text-orange-600">
                              {result.stockSummary.productsNeedingProduction} precisam produção
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {result.availableStockCount > 0 && (
                      <span className="text-sm font-medium text-green-600">
                        {result.availableStockCount} disponível
                      </span>
                    )}
                    {onOrderSelect && (
                      <button
                        onClick={() => onOrderSelect(result.pedidoId)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockVerificationPanel;
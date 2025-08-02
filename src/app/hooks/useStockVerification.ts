import { useState, useEffect, useCallback } from 'react';
import { verifyStockForAllOrders, verifyStockForOrder, clearStockVerificationCache } from '../services/stockVerificationService';

// Tipos para o hook (baseados no serviço, mas simplificados para o estado)
export interface StockVerificationState {
  isLoading: boolean;
  error: string | null;
  results: StockVerificationResult[];
  lastUpdated: Date | null;
}

export interface StockVerificationResult {
  pedidoId: string;
  pedidoNumero: string;
  comprador: string;
  hasAvailableStock: boolean;
  stockSummary: {
    totalProducts: number;
    productsWithStock: number;
    productsNeedingProduction: number;
  };
  stockLevel: 'kit' | 'modelo' | 'peca' | 'parte' | 'none';
  availableStockCount: number;
}

export interface UseStockVerificationReturn {
  state: StockVerificationState;
  actions: {
    verifyAllOrders: () => Promise<void>;
    verifySpecificOrder: (pedidoId: string) => Promise<void>;
    refreshData: () => Promise<void>;
    clearCache: () => void;
  };
}

/**
 * Hook personalizado para gerenciar verificação de estoque
 */
export function useStockVerification(): UseStockVerificationReturn {
  const [state, setState] = useState<StockVerificationState>({
    isLoading: false,
    error: null,
    results: [],
    lastUpdated: null
  });

  /**
   * Processa os resultados do serviço para o formato do hook
   */
  const processResults = useCallback((serviceResults: any[]): StockVerificationResult[] => {
    return serviceResults.map(result => {
      const totalProducts = result.produtos.length;
      const productsWithStock = result.produtos.filter((p: any) => p.stockDetails.length > 0).length;
      const productsNeedingProduction = result.produtos.filter((p: any) => p.productionNeeds.length > 0).length;
      
      // Determinar o nível de estoque mais alto disponível
      let stockLevel: 'kit' | 'modelo' | 'peca' | 'parte' | 'none' = 'none';
      let availableStockCount = 0;
      
      for (const produto of result.produtos) {
        if (produto.stockDetails.length > 0) {
          const highestLevel = produto.stockLevel;
          if (stockLevel === 'none' || 
              (highestLevel === 'kit') ||
              (highestLevel === 'modelo' && stockLevel !== 'kit') ||
              (highestLevel === 'peca' && !['kit', 'modelo'].includes(stockLevel)) ||
              (highestLevel === 'parte' && stockLevel === 'none')) {
            stockLevel = highestLevel;
          }
          availableStockCount += produto.availableStock;
        }
      }

      return {
        pedidoId: result.pedidoId,
        pedidoNumero: result.pedidoNumero,
        comprador: result.comprador,
        hasAvailableStock: result.hasAvailableStock,
        stockSummary: {
          totalProducts,
          productsWithStock,
          productsNeedingProduction
        },
        stockLevel,
        availableStockCount
      };
    });
  }, []);

  /**
   * Verifica estoque para todos os pedidos
   */
  const verifyAllOrders = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('[useStockVerification] Starting verification for all orders...');
      const serviceResults = await verifyStockForAllOrders();
      const processedResults = processResults(serviceResults);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        results: processedResults,
        lastUpdated: new Date(),
        error: null
      }));
      
      console.log(`[useStockVerification] Verification completed for ${processedResults.length} orders`);
    } catch (error) {
      console.error('[useStockVerification] Error during verification:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido durante verificação'
      }));
    }
  }, [processResults]);

  /**
   * Verifica estoque para um pedido específico
   */
  const verifySpecificOrder = useCallback(async (pedidoId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log(`[useStockVerification] Starting verification for order ${pedidoId}...`);
      const serviceResult = await verifyStockForOrder(pedidoId);
      
      if (serviceResult) {
        const processedResult = processResults([serviceResult])[0];
        
        setState(prev => ({
          ...prev,
          isLoading: false,
          results: prev.results.map(r => 
            r.pedidoId === pedidoId ? processedResult : r
          ).concat(
            prev.results.find(r => r.pedidoId === pedidoId) ? [] : [processedResult]
          ),
          lastUpdated: new Date(),
          error: null
        }));
        
        console.log(`[useStockVerification] Verification completed for order ${pedidoId}`);
      } else {
        throw new Error(`Pedido ${pedidoId} não encontrado`);
      }
    } catch (error) {
      console.error(`[useStockVerification] Error verifying order ${pedidoId}:`, error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido durante verificação'
      }));
    }
  }, [processResults]);

  /**
   * Atualiza os dados limpando o cache e verificando novamente
   */
  const refreshData = useCallback(async () => {
    console.log('[useStockVerification] Refreshing data...');
    clearStockVerificationCache();
    await verifyAllOrders();
  }, [verifyAllOrders]);

  /**
   * Limpa o cache do serviço
   */
  const clearCache = useCallback(() => {
    console.log('[useStockVerification] Clearing cache...');
    clearStockVerificationCache();
  }, []);

  /**
   * Verificação automática ao montar o componente
   */
  useEffect(() => {
    console.log('[useStockVerification] Hook mounted, starting initial verification...');
    verifyAllOrders();
  }, [verifyAllOrders]);

  return {
    state,
    actions: {
      verifyAllOrders,
      verifySpecificOrder,
      refreshData,
      clearCache
    }
  };
}

/**
 * Hook simplificado para verificação de um pedido específico
 */
export function useOrderStockVerification(pedidoId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockVerificationResult | null>(null);

  const verify = useCallback(async () => {
    if (!pedidoId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const serviceResult = await verifyStockForOrder(pedidoId);
      
      if (serviceResult) {
        const totalProducts = serviceResult.produtos.length;
        const productsWithStock = serviceResult.produtos.filter((p: any) => p.stockDetails.length > 0).length;
        const productsNeedingProduction = serviceResult.produtos.filter((p: any) => p.productionNeeds.length > 0).length;
        
        let stockLevel: 'kit' | 'modelo' | 'peca' | 'parte' | 'none' = 'none';
        let availableStockCount = 0;
        
        for (const produto of serviceResult.produtos) {
          if (produto.stockDetails.length > 0) {
            const highestLevel = produto.stockLevel;
            if (stockLevel === 'none' || 
                (highestLevel === 'kit') ||
                (highestLevel === 'modelo' && stockLevel !== 'kit') ||
                (highestLevel === 'peca' && !['kit', 'modelo'].includes(stockLevel)) ||
                (highestLevel === 'parte' && stockLevel === 'none')) {
              stockLevel = highestLevel;
            }
            availableStockCount += produto.availableStock;
          }
        }

        setResult({
          pedidoId: serviceResult.pedidoId,
          pedidoNumero: serviceResult.pedidoNumero,
          comprador: serviceResult.comprador,
          hasAvailableStock: serviceResult.hasAvailableStock,
          stockSummary: {
            totalProducts,
            productsWithStock,
            productsNeedingProduction
          },
          stockLevel,
          availableStockCount
        });
      } else {
        setResult(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [pedidoId]);

  useEffect(() => {
    verify();
  }, [verify]);

  return {
    isLoading,
    error,
    result,
    verify
  };
}
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface ExpansionContextType {
  expandedNodes: Record<string, Set<string>>; // [pedidoId]: Set<nodeIds>
  toggleNode: (pedidoId: string, nodeId: string) => void;
  expandAll: (pedidoId: string, nodeIds: string[]) => void;
  collapseAll: (pedidoId: string) => void;
  clearPedido: (pedidoId: string) => void;
  getExpandedNodes: (pedidoId: string) => Set<string>;
}

const ExpansionContext = createContext<ExpansionContextType | null>(null);

interface ExpansionProviderProps {
  children: ReactNode;
}

export const ExpansionProvider: React.FC<ExpansionProviderProps> = ({ children }) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, Set<string>>>(() => {
    // Carregar estado inicial do localStorage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hierarchy-expansion-global');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Converter arrays de volta para Sets
          const converted: Record<string, Set<string>> = {};
          Object.entries(parsed).forEach(([pedidoId, nodeIds]) => {
            converted[pedidoId] = new Set(nodeIds as string[]);
          });
          return converted;
        }
      } catch (e) {
        console.warn('Erro ao carregar estado de expansão do localStorage:', e);
      }
    }
    return {};
  });

  // Salvar estado no localStorage quando mudar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Converter Sets para arrays para salvar no localStorage
        const serializable: Record<string, string[]> = {};
        Object.entries(expandedNodes).forEach(([pedidoId, nodeSet]) => {
          serializable[pedidoId] = Array.from(nodeSet);
        });
        localStorage.setItem('hierarchy-expansion-global', JSON.stringify(serializable));
      } catch (e) {
        console.warn('Erro ao salvar estado de expansão no localStorage:', e);
      }
    }
  }, [expandedNodes]);

  const toggleNode = useCallback((pedidoId: string, nodeId: string) => {
    setExpandedNodes(prev => {
      const current = new Set(prev[pedidoId] || []);
      if (current.has(nodeId)) {
        current.delete(nodeId);
      } else {
        current.add(nodeId);
      }
      return {
        ...prev,
        [pedidoId]: new Set(current)
      };
    });
  }, []);

  const expandAll = useCallback((pedidoId: string, nodeIds: string[]) => {
    setExpandedNodes(prev => ({
      ...prev,
      [pedidoId]: new Set(nodeIds)
    }));
  }, []);

  const collapseAll = useCallback((pedidoId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [pedidoId]: new Set()
    }));
  }, []);

  const clearPedido = useCallback((pedidoId: string) => {
    setExpandedNodes(prev => {
      const newExpanded = { ...prev };
      delete newExpanded[pedidoId];
      return newExpanded;
    });
  }, []);

  const getExpandedNodes = useCallback((pedidoId: string): Set<string> => {
    return expandedNodes[pedidoId] || new Set();
  }, [expandedNodes]);

  return (
    <ExpansionContext.Provider value={{
      expandedNodes,
      toggleNode,
      expandAll,
      collapseAll,
      clearPedido,
      getExpandedNodes
    }}>
      {children}
    </ExpansionContext.Provider>
  );
};

export const useExpansionContext = () => {
  const context = useContext(ExpansionContext);
  if (!context) {
    throw new Error('useExpansionContext must be used within ExpansionProvider');
  }
  return context;
};
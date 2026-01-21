import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import { ProdutoFinalNecessario, PackagingModelo, PackagingPeca } from '../types'; // Import types from ../types

interface PackagingOrderItemProps {
  item: ProdutoFinalNecessario | PackagingModelo | PackagingPeca;
  type: 'kit' | 'modelo' | 'peca';
  assemblyGroupId: string;
  isPackagingStarted: boolean;
  checkedItems: Record<string, boolean>;
  onToggleItem: (assemblyGroupId: string, itemId: string, isChecked: boolean) => void;
  parentPath?: string[]; // New prop for hierarchical context
}

const PackagingOrderItem: React.FC<PackagingOrderItemProps> = ({
  item,
  type,
  assemblyGroupId,
  isPackagingStarted,
  checkedItems,
  onToggleItem,
  parentPath = []
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Create hierarchical ID to avoid conflicts between items with same name but different hierarchy
  const getHierarchicalId = useMemo(() => {
    if (type === 'kit' && 'produtoId' in item) {
      // Build full path for kit
      const fullPath = [...parentPath, 'kit', item.produtoId].join('_');
      return `kit_${item.produtoId}_${fullPath}`;
    }
    if (type === 'modelo' && 'modeloId' in item) {
      // Build full path for modelo
      const fullPath = [...parentPath, 'modelo', item.modeloId].join('_');
      return `modelo_${item.modeloId}_${fullPath}`;
    }
    if (type === 'peca' && 'pecaId' in item) {
      // Build full path for peca
      const fullPath = [...parentPath, 'peca', item.pecaId].join('_');
      return `peca_${item.pecaId}_${fullPath}`;
    }
    return '';
  }, [item, type, parentPath]);

  // Get current hierarchical path for this item
  const currentHierarchicalPath = useMemo(() => {
    return [...parentPath, getHierarchicalId];
  }, [parentPath, getHierarchicalId]);

  // Check if this item is checked using hierarchical ID
  const isChecked = useMemo(() => {
    return checkedItems[getHierarchicalId] || false;
  }, [checkedItems, getHierarchicalId]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggleItem(assemblyGroupId, getHierarchicalId, e.target.checked);
  };

  const isFulfilled = (item.quantidadeAtendida || 0) >= item.quantidade;
  const textColorClass = isFulfilled ? 'text-green-600' : 'text-red-600';

  // Check if item has children
  const hasChildren = useMemo(() => {
    if (type === 'kit') {
      const kitItem = item as ProdutoFinalNecessario;
      return ((kitItem.modelos && kitItem.modelos.length > 0) || 
              (kitItem.pecas && kitItem.pecas.length > 0));
    }
    // PackagingModelo can have peças as children
    if (type === 'modelo') {
      const modeloItem = item as PackagingModelo;
      return modeloItem.pecas && modeloItem.pecas.length > 0;
    }
    // PackagingPeca doesn't have children
    return false;
  }, [item, type]);

  return (
    <div className={`border-l-2 border-gray-200 pl-4 mt-2 ${parentPath.length > 0 ? 'ml-4' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            type="checkbox"
            className="form-checkbox h-4 w-4 text-blue-600"
            checked={isChecked}
            onChange={handleCheckboxChange}
            disabled={!isPackagingStarted}
          />
          <span className={`ml-2 text-sm font-medium ${textColorClass}`}>
            {item.nome} (x{item.quantidade}) - Atendido: {item.quantidadeAtendida || 0} / Estoque: {item.estoqueAtual || 0}
            {parentPath.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({parentPath.join(' > ')} {type})
              </span>
            )}
          </span>
          {!isFulfilled && <XCircle className="h-4 w-4 ml-1 text-red-500" />}
          {isFulfilled && <CheckCircle className="h-4 w-4 ml-1 text-green-500" />}
        </div>
        {hasChildren && (
          <button onClick={handleToggleExpand} className="p-1 text-gray-500 hover:text-gray-700">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {isExpanded && type === 'kit' && (item as ProdutoFinalNecessario).modelos && (item as ProdutoFinalNecessario).modelos!.length > 0 && (
        <div className="ml-6">
          {(item as ProdutoFinalNecessario).modelos!.map((modelo: PackagingModelo) => (
            <PackagingOrderItem
              key={modelo.modeloId}
              item={modelo}
              type="modelo"
              assemblyGroupId={assemblyGroupId}
              isPackagingStarted={isPackagingStarted}
              checkedItems={checkedItems}
              onToggleItem={onToggleItem}
              parentPath={currentHierarchicalPath}
            />
          ))}
        </div>
      )}

      {isExpanded && type === 'kit' && (item as ProdutoFinalNecessario).pecas && (item as ProdutoFinalNecessario).pecas!.length > 0 && (
        <div className="ml-6">
          {(item as ProdutoFinalNecessario).pecas!.map((peca: PackagingPeca) => (
            <PackagingOrderItem
              key={peca.pecaId}
              item={peca}
              type="peca"
              assemblyGroupId={assemblyGroupId}
              isPackagingStarted={isPackagingStarted}
              checkedItems={checkedItems}
              onToggleItem={onToggleItem}
              parentPath={currentHierarchicalPath}
            />
          ))}
        </div>
      )}

      {isExpanded && type === 'modelo' && (item as PackagingModelo).pecas && (item as PackagingModelo).pecas!.length > 0 && (
        <div className="ml-6">
          {(item as PackagingModelo).pecas!.map((peca: PackagingPeca) => (
            <PackagingOrderItem
              key={peca.pecaId}
              item={peca}
              type="peca"
              assemblyGroupId={assemblyGroupId}
              isPackagingStarted={isPackagingStarted}
              checkedItems={checkedItems}
              onToggleItem={onToggleItem}
              parentPath={currentHierarchicalPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PackagingOrderItem;

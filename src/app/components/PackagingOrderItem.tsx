import React, { useState } from 'react';
import { ChevronUp, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import { ProdutoFinalNecessario, PackagingModelo, PackagingPeca } from '../types'; // Import types from ../types

interface PackagingOrderItemProps {
  item: ProdutoFinalNecessario | PackagingModelo | PackagingPeca;
  type: 'kit' | 'modelo' | 'peca';
  assemblyGroupId: string;
  isPackagingStarted: boolean;
  checkedItems: Record<string, boolean>;
  onToggleItem: (assemblyGroupId: string, itemId: string, isChecked: boolean) => void;
}

const PackagingOrderItem: React.FC<PackagingOrderItemProps> = ({
  item,
  type,
  assemblyGroupId,
  isPackagingStarted,
  checkedItems,
  onToggleItem,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const getItemId = (currentItem: ProdutoFinalNecessario | PackagingModelo | PackagingPeca, itemType: 'kit' | 'modelo' | 'peca'): string => {
    if (itemType === 'kit' && 'produtoId' in currentItem) return currentItem.produtoId;
    if (itemType === 'modelo' && 'modeloId' in currentItem) return currentItem.modeloId;
    if (itemType === 'peca' && 'pecaId' in currentItem) return currentItem.pecaId;
    return ''; // Should not happen if types are correct
  };

  const itemId = getItemId(item, type);
  const isChecked = checkedItems[itemId] || false;

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggleItem(assemblyGroupId, itemId, e.target.checked);
  };

  const isFulfilled = (item.quantidadeAtendida || 0) >= item.quantidade;
  const textColorClass = isFulfilled ? 'text-green-600' : 'text-red-600';

  const hasChildren =
    (type === 'kit' && (item as ProdutoFinalNecessario).modelos && (item as ProdutoFinalNecessario).modelos!.length > 0) ||
    (type === 'modelo' && (item as PackagingModelo).pecas && (item as PackagingModelo).pecas!.length > 0);

  return (
    <div className="border-l-2 border-gray-200 pl-4 mt-2">
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PackagingOrderItem;

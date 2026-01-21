import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Package, Box, Component, Puzzle, CheckCircle, AlertCircle } from 'lucide-react';
import { SummaryItem } from '../types';

interface UseStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: SummaryItem | null;
  onConfirm: (item: SummaryItem, nivelUsado: number, produtoId: string, produtoTipo: SummaryItem['tipo'], quantidade: number) => Promise<void>;
  verificarEstoqueTopDown: (item: SummaryItem) => {
    podeUsarEstoque: boolean;
    nivelUsado?: number;
    produtoId?: string;
    produtoTipo?: SummaryItem['tipo'];
    quantidadeDisponivel?: number;
  };
}

const UseStockModal: React.FC<UseStockModalProps> = ({
  isOpen,
  onClose,
  item,
  onConfirm,
  verificarEstoqueTopDown
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [quantidade, setQuantidade] = useState(1);

  if (!item) return null;

  const quantidadeNecessaria = item.necessario - item.finalizado;
  const resultadoVerificacao = verificarEstoqueTopDown(item);
  const podeUsarEstoque = resultadoVerificacao.podeUsarEstoque;
  const nivelUsado = resultadoVerificacao.nivelUsado || 0;
  const produtoId = resultadoVerificacao.produtoId || item.documentId;
  const produtoTipo = resultadoVerificacao.produtoTipo || item.tipo;

  const getTipoIcon = (tipo: SummaryItem['tipo']) => {
    switch (tipo) {
      case 'kit': return <Package className="h-5 w-5 text-blue-500" />;
      case 'modelo': return <Box className="h-5 w-5 text-green-500" />;
      case 'peca': return <Component className="h-5 w-5 text-yellow-500" />;
      case 'parte': return <Puzzle className="h-5 w-5 text-purple-500" />;
      default: return null;
    }
  };

  const getNivelDescricao = (nivel: number) => {
    switch (nivel) {
      case 0: return 'Produto final (nível 0)';
      case 1: return 'Componentes diretos (nível 1)';
      case 2: return 'Subcomponentes (nível 2)';
      case 3: return 'Partes (nível 3)';
      default: return `Nível ${nivel}`;
    }
  };

  const handleConfirm = async () => {
    if (!podeUsarEstoque || quantidade <= 0) return;

    setIsLoading(true);
    try {
      await onConfirm(item, nivelUsado, produtoId, produtoTipo, quantidade);
      onClose();
    } catch (error) {
      console.error('Erro ao confirmar uso de estoque:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex items-center gap-2"
                >
                  {getTipoIcon(item.tipo)}
                  Usar Estoque
                </Dialog.Title>

                <div className="mt-4">
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{item.produtoNome}</span>
                      <span className="text-sm text-gray-500">{item.sku}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Tipo:</span>
                        <span className="ml-2 capitalize">{item.tipo}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Necessário:</span>
                        <span className="ml-2">{quantidadeNecessaria}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Em estoque:</span>
                        <span className="ml-2">{item.emEstoque}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Finalizado:</span>
                        <span className="ml-2">{item.finalizado}</span>
                      </div>
                    </div>
                  </div>

                  {podeUsarEstoque ? (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-green-600 mb-2">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Estoque disponível!</span>
                      </div>
                      <div className="text-sm text-gray-600 mb-4">
                        <p>Será usado estoque do {getNivelDescricao(nivelUsado)}.</p>
                        {resultadoVerificacao.quantidadeDisponivel && (
                          <p className="mt-1">
                            Quantidade disponível: {resultadoVerificacao.quantidadeDisponivel}
                          </p>
                        )}
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Quantidade a usar:
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={quantidadeNecessaria}
                          value={quantidade}
                          onChange={(e) => setQuantidade(Math.max(1, Math.min(quantidadeNecessaria, parseInt(e.target.value) || 1)))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Máximo: {quantidadeNecessaria} unidades
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600 mb-4">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">Estoque insuficiente</span>
                    </div>
                  )}

                  {item.children && item.children.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Componentes:</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {item.children.map((child) => (
                          <div key={child.documentId} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {getTipoIcon(child.tipo)}
                              <span>{child.produtoNome}</span>
                            </div>
                            <div className="text-gray-500">
                              <span className="mr-2">Estq: {child.emEstoque}</span>
                              <span>Nec: {child.necessario - child.finalizado}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!podeUsarEstoque || isLoading}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleConfirm}
                  >
                    {isLoading ? 'Processando...' : 'Confirmar Uso de Estoque'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default UseStockModal;

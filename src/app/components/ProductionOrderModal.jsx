"use client";

import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { X } from 'lucide-react';

export default function ProductionOrderModal({ isOpen, onClose, orderData }) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex justify-between items-center"
                >
                  Ordem de Produção #{orderData?.numero || ''}
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </Dialog.Title>
                <div className="mt-4">
                  {orderData ? (
                    <div className="space-y-4">
                      <p>Comprador: {orderData.comprador}</p>
                      <p>Data do Pedido: {orderData.dataCriacao?.toLocaleDateString('pt-BR')}</p>
                      <p>Previsão de Entrega: {orderData.dataPrevisao?.toLocaleDateString('pt-BR')}</p>
                      <h4 className="text-md font-medium text-gray-800 mt-4">Produtos:</h4>
                      <ul className="list-disc list-inside ml-4">
                        {orderData.produtos?.map((product, index) => (
                          <li key={index}>
                            {product.nome} ({product.tipo}) - Quantidade: {product.quantidade}
                            {/* You can add more details here from the embedded snapshot */}
                          </li>
                        ))}
                      </ul>
                      <p className="font-bold mt-4">Custo Total: R$ {orderData.custos?.total?.toFixed(2) || '0.00'}</p>
                      <p className="font-bold">Tempo Total de Impressão: {orderData.tempos?.totalImpressao || 0} min</p>
                      <p className="font-bold">Tempo Total de Montagem: {orderData.tempos?.totalMontagem || 0} min</p>
                      <p className="font-bold">Consumo Total de Filamento: {orderData.tempos?.totalConsumoFilamento || 0} g</p>
                    </div>
                  ) : (
                    <p>Nenhum dado de ordem de produção disponível.</p>
                  )}
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    Fechar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

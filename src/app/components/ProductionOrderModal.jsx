import React, { useState, useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

export default function ProductionOrderModal({ isOpen, onClose, orderData }) {
  const [productionGroups, setProductionGroups] = useState([]);

  useEffect(() => {
    if (isOpen && orderData) {
      processOrderData(orderData);
    }
  }, [isOpen, orderData]);

  const fetchPecaDetails = async (pecaId) => {
    try {
      const pecaDocRef = doc(db, 'pecas', pecaId);
      const pecaDocSnap = await getDoc(pecaDocRef);
      if (pecaDocSnap.exists()) {
        return { id: pecaDocSnap.id, ...pecaDocSnap.data() };
      } else {
        console.warn(`Peca with ID ${pecaId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching peca details for ${pecaId}:`, error);
      return null;
    }
  };

  const fetchModeloDetails = async (modeloId) => {
    try {
      const modeloDocRef = doc(db, 'modelos', modeloId);
      const modeloDocSnap = await getDoc(modeloDocRef);
      if (modeloDocSnap.exists()) {
        const modeloData = { id: modeloDocSnap.id, ...modeloDocSnap.data() };
        const pecasPromises = modeloData.pecas.map(p => fetchPecaDetails(p.id));
        modeloData.pecas = (await Promise.all(pecasPromises)).filter(Boolean);
        return modeloData;
      } else {
        console.warn(`Modelo with ID ${modeloId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching modelo details for ${modeloId}:`, error);
      return null;
    }
  };

  const fetchKitDetails = async (kitId) => {
    try {
      const kitDocRef = doc(db, 'kits', kitId);
      const kitDocSnap = await getDoc(kitDocRef);
      if (kitDocSnap.exists()) {
        const kitData = { id: kitDocSnap.id, ...kitDocSnap.data() };
        const produtosPromises = kitData.produtos.map(async (p) => {
          if (p.tipo === 'modelo') {
            return await fetchModeloDetails(p.id);
          } else if (p.tipo === 'peca') {
            return await fetchPecaDetails(p.id);
          }
          return null;
        });
        kitData.produtos = (await Promise.all(produtosPromises)).filter(Boolean);
        return kitData;
      } else {
        console.warn(`Kit with ID ${kitId} not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching kit details for ${kitId}:`, error);
      return null;
    }
  };

  const processOrderData = async (pedido) => {
    const groups = {};
    const allPecasToPrint = [];

    for (const item of pedido.produtos || []) {
      if (item.tipo === 'peca') {
        const pecaDetails = await fetchPecaDetails(item.id);
        if (pecaDetails) {
          allPecasToPrint.push({
            modelo: pecaDetails.nome, // Assuming 'nome' is the display name for a piece
            corFilamento: pecaDetails.corFilamento,
            quantidade: item.quantidade,
          });
        }
      } else if (item.tipo === 'modelo') {
        const modeloDetails = await fetchModeloDetails(item.id);
        if (modeloDetails && modeloDetails.pecas) {
          modeloDetails.pecas.forEach(peca => {
            allPecasToPrint.push({
              modelo: peca.nome,
              corFilamento: peca.corFilamento,
              quantidade: item.quantidade * (peca.quantidade || 1), // Multiply by model quantity
            });
          });
        }
      } else if (item.tipo === 'kit') {
        const kitDetails = await fetchKitDetails(item.id);
        if (kitDetails && kitDetails.produtos) {
          kitDetails.produtos.forEach(kitProduct => {
            if (kitProduct.tipo === 'peca') {
              allPecasToPrint.push({
                modelo: kitProduct.nome,
                corFilamento: kitProduct.corFilamento,
                quantidade: item.quantidade * (kitProduct.quantidade || 1), // Multiply by kit quantity
              });
            } else if (kitProduct.tipo === 'modelo' && kitProduct.pecas) {
              kitProduct.pecas.forEach(peca => {
                allPecasToPrint.push({
                  modelo: peca.nome,
                  corFilamento: peca.corFilamento,
                  quantidade: item.quantidade * (kitProduct.quantidade || 1) * (peca.quantidade || 1), // Multiply by kit and model quantity
                });
              });
            }
          });
        }
      }
    }

    allPecasToPrint.forEach(peca => {
      const key = `${peca.corFilamento}`;
      if (!groups[key]) {
        groups[key] = {
          corFilamento: peca.corFilamento,
          items: [],
        };
      }
      // Aggregate quantities for the same model and color
      const existingItemIndex = groups[key].items.findIndex(i => i.modelo === peca.modelo);
      if (existingItemIndex > -1) {
        groups[key].items[existingItemIndex].quantidade += peca.quantidade;
      } else {
        groups[key].items.push({
          modelo: peca.modelo,
          quantidade: peca.quantidade,
        });
      }
    });

    // Convert object to array and sort by filament color
    const sortedGroups = Object.values(groups).sort((a, b) => a.corFilamento.localeCompare(b.corFilamento));
    setProductionGroups(sortedGroups);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-4xl w-full relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-900"
        >
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Ordem de Produção - Pedido #{orderData?.numero}</h2>

        {productionGroups.length > 0 ? (
          <div className="space-y-6">
            {productionGroups.map((group, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Grupo de Impressão: Filamento {group.corFilamento}
                </h3>
                <ul className="divide-y divide-gray-200">
                  {group.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="py-2 flex justify-between items-center">
                      <span className="text-gray-700">{item.modelo}</span>
                      <span className="text-gray-900 font-medium">x{item.quantidade}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">Nenhuma peça encontrada para esta ordem de produção.</p>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => window.print()} // Basic print functionality
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Ordem
          </button>
        </div>
      </div>
    </div>
  );
}

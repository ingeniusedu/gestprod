"use client";

import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, Trash2 } from 'lucide-react';
import PedidoFormModal from '../components/PedidoFormModal';
import ProductionOrderModal from '../components/ProductionOrderModal';
import { db } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export default function Pedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPedido, setCurrentPedido] = useState(null);
  const [isProductionOrderModalOpen, setIsProductionOrderModalOpen] = useState(false);
  const [productionOrderData, setProductionOrderData] = useState(null);

  useEffect(() => {
    fetchPedidos();
  }, []);

  const handleGenerateProductionOrder = (pedido) => {
    // Here we will process the pedido to generate the production order data
    // For now, let's just pass the pedido directly
    setProductionOrderData(pedido);
    setIsProductionOrderModalOpen(true);
  };

  const fetchPedidos = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'pedidos'));
      const pedidosList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        dataCriacao: doc.data().dataCriacao.toDate(),
        dataPrevisao: doc.data().dataPrevisao.toDate(),
        dataConclusao: doc.data().dataConclusao ? doc.data().dataConclusao.toDate() : null,
      }));
      setPedidos(pedidosList);
    } catch (error) {
      console.error("Error fetching pedidos: ", error);
    }
  };

  const handleSavePedido = async (pedidoData) => {
    try {
      if (pedidoData.id) {
        // Update existing pedido
        const { id, ...dataToUpdate } = pedidoData;
        await updateDoc(doc(db, 'pedidos', id), dataToUpdate);
        console.log("Pedido updated successfully!");
      } else {
        // Add new pedido
        await addDoc(collection(db, 'pedidos'), pedidoData);
        console.log("Pedido added successfully!");
      }
      fetchPedidos(); // Refresh the list
    } catch (error) {
      console.error("Error saving pedido: ", error);
    }
  };

  const handleDeletePedido = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir este pedido?")) {
      try {
        await deleteDoc(doc(db, 'pedidos', id));
        console.log("Pedido deleted successfully!");
        fetchPedidos(); // Refresh the list
      } catch (error) {
        console.error("Error deleting pedido: ", error);
      }
    }
  };

  const handleNewPedido = () => {
    setCurrentPedido(null);
    setIsModalOpen(true);
  };

  const handleEditPedido = (pedido) => {
    setCurrentPedido(pedido);
    setIsModalOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'aguardando':
        return 'bg-yellow-100 text-yellow-800';
      case 'em_producao':
        return 'bg-blue-100 text-blue-800';
      case 'concluido':
        return 'bg-green-100 text-green-800';
      case 'cancelado':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('pt-BR');
  };

  const filteredPedidos = pedidos.filter(pedido => {
    const matchesSearch = pedido.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pedido.comprador.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || pedido.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie todos os pedidos de produção
          </p>
        </div>
        <button
          onClick={handleNewPedido}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Pedido
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Busca */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar por número ou comprador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filtro de Status */}
          <div className="relative">
            <select
              className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos os Status</option>
              <option value="aguardando">Aguardando</option>
              <option value="em_producao">Em Produção</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Filtros Avançados */}
          <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <Filter className="h-4 w-4 mr-2" />
            Filtros Avançados
          </button>
        </div>
      </div>

      {/* Lista de Pedidos */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Lista de Pedidos ({filteredPedidos.length})
          </h3>
        </div>

        {filteredPedidos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pedido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comprador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Criação
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Previsão
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPedidos.map((pedido) => (
                  <tr key={pedido.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          #{pedido.numero}
                        </div>
                        <div className="text-sm text-gray-500">
                          {pedido.produtos.length} produto(s)
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{pedido.comprador}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(pedido.status)}`}>
                        {pedido.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(pedido.dataCriacao)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(pedido.dataPrevisao)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      R$ {pedido.custos.total.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleGenerateProductionOrder(pedido)}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                          title="Gerar Ordem de Produção"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Ordem
                        </button>
                        <button
                          onClick={() => handleEditPedido(pedido)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          title="Editar Pedido"
                        >
                          <Edit className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeletePedido(pedido.id)}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          title="Excluir Pedido"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="mx-auto h-12 w-12" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">Nenhum pedido encontrado</h3>
            <p className="text-sm text-gray-500">
              Tente ajustar os filtros ou criar um novo pedido.
            </p>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Resumo</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {pedidos.filter(p => p.status === 'aguardando').length}
            </div>
            <div className="text-sm text-gray-500">Aguardando</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {pedidos.filter(p => p.status === 'em_producao').length}
            </div>
            <div className="text-sm text-gray-500">Em Produção</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {pedidos.filter(p => p.status === 'concluido').length}
            </div>
            <div className="text-sm text-gray-500">Concluídos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {pedidos.filter(p => p.status === 'cancelado').length}
            </div>
            <div className="text-sm text-gray-500">Cancelados</div>
          </div>
        </div>
      </div>

      <PedidoFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePedido}
        initialData={currentPedido}
      />

      <ProductionOrderModal
        isOpen={isProductionOrderModalOpen}
        onClose={() => setIsProductionOrderModalOpen(false)}
        orderData={productionOrderData}
      />
    </div>
  );
}

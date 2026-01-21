"use client";

import React, { useState, useEffect } from 'react';
import { Pedido } from '../../types';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Calendar, Clock, Package, DollarSign, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface ServiceCosts {
  costPerMinute3DPrint: number;
  costPerMinuteAssembly: number;
  costPerMinutePackaging: number;
}

interface ServiceTime {
  impressao3d: number; // minutos
  montagem: number; // minutos
  embalagem: number; // minutos
}

interface CompletedOrdersTableProps {
  pedidos: Pedido[];
}

const CompletedOrdersTable: React.FC<CompletedOrdersTableProps> = ({ pedidos }) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [serviceCosts, setServiceCosts] = useState<ServiceCosts | null>(null);
  const [serviceTimes, setServiceTimes] = useState<Record<string, ServiceTime>>({});
  const [loadingCosts, setLoadingCosts] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Carregar configurações de custos
  useEffect(() => {
    const fetchServiceCosts = async () => {
      try {
        const docRef = doc(db, 'settings', 'serviceCosts');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setServiceCosts({
            costPerMinute3DPrint: data.costPerMinute3DPrint || 0,
            costPerMinuteAssembly: data.costPerMinuteAssembly || 0,
            costPerMinutePackaging: data.costPerMinutePackaging || 0,
          });
        }
      } catch (error) {
        console.error("Erro ao buscar custos de serviço:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServiceCosts();
  }, []);

  // Buscar tempos de serviço para um pedido específico
  const fetchServiceTimes = async (pedidoId: string) => {
    if (loadingCosts[pedidoId]) return;
    
    setLoadingCosts(prev => ({ ...prev, [pedidoId]: true }));
    
    try {
      const lancamentosQuery = query(
        collection(db, 'lancamentoServicos'),
        where('pedidoId', '==', pedidoId)
      );
      
      const querySnapshot = await getDocs(lancamentosQuery);
      let impressao3d = 0;
      let montagem = 0;
      let embalagem = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.servicoId === 'impressao_3d') {
          impressao3d += (data.quantidade || 0) * 60; // converter horas para minutos
        } else if (data.servicoId === 'montagem') {
          montagem += (data.quantidade || 0) * 60;
        } else if (data.servicoId === 'embalagem') {
          embalagem += (data.quantidade || 0) * 60;
        }
      });

      setServiceTimes(prev => ({
        ...prev,
        [pedidoId]: { impressao3d, montagem, embalagem }
      }));
    } catch (error) {
      console.error(`Erro ao buscar tempos de serviço para pedido ${pedidoId}:`, error);
    } finally {
      setLoadingCosts(prev => ({ ...prev, [pedidoId]: false }));
    }
  };

  // Calcular custos para um pedido
  const calculateCosts = (pedidoId: string) => {
    const times = serviceTimes[pedidoId];
    if (!times || !serviceCosts) return null;

    return {
      impressao3d: times.impressao3d * serviceCosts.costPerMinute3DPrint,
      montagem: times.montagem * serviceCosts.costPerMinuteAssembly,
      embalagem: times.embalagem * serviceCosts.costPerMinutePackaging,
      total: (times.impressao3d * serviceCosts.costPerMinute3DPrint) +
             (times.montagem * serviceCosts.costPerMinuteAssembly) +
             (times.embalagem * serviceCosts.costPerMinutePackaging)
    };
  };

  // Formatar data
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    
    let date: Date;
    
    // Se for um objeto Timestamp do Firestore
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    }
    // Se for um objeto Date
    else if (timestamp instanceof Date) {
      date = timestamp;
    }
    // Se for uma string ISO
    else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    }
    // Se for um objeto com seconds/nanoseconds
    else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      date = new Date(timestamp.seconds * 1000);
    }
    // Caso padrão
    else {
      try {
        date = new Date(timestamp);
      } catch (error) {
        console.error('Erro ao converter data:', timestamp, error);
        return 'Data inválida';
      }
    }
    
    // Verificar se a data é válida
    if (isNaN(date.getTime())) {
      return 'Data inválida';
    }
    
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Calcular tempo total de produção
  const calculateTotalTime = (pedido: Pedido) => {
    if (!pedido.dataCriacao || !pedido.dataConclusao) return 'N/A';
    
    const convertToDate = (timestamp: any): Date | null => {
      if (!timestamp) return null;
      
      // Se for um objeto Timestamp do Firestore
      if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      // Se for um objeto Date
      else if (timestamp instanceof Date) {
        return timestamp;
      }
      // Se for uma string ISO
      else if (typeof timestamp === 'string') {
        return new Date(timestamp);
      }
      // Se for um objeto com seconds/nanoseconds
      else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        return new Date(timestamp.seconds * 1000);
      }
      // Caso padrão
      else {
        try {
          return new Date(timestamp);
        } catch (error) {
          console.error('Erro ao converter data:', timestamp, error);
          return null;
        }
      }
    };
    
    const start = convertToDate(pedido.dataCriacao);
    const end = convertToDate(pedido.dataConclusao);
    
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 'N/A';
    }
    
    const diffMs = end.getTime() - start.getTime();
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '0m';
  };

  // Calcular quantidade total de produtos
  const calculateTotalProducts = (pedido: Pedido) => {
    return pedido.produtos.reduce((total, produto) => total + produto.quantidade, 0);
  };

  // Alternar expansão da linha
  const toggleRow = (pedidoId: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [pedidoId]: !prev[pedidoId]
    }));

    // Buscar tempos de serviço se ainda não foram buscados
    if (!serviceTimes[pedidoId] && !loadingCosts[pedidoId]) {
      fetchServiceTimes(pedidoId);
    }
  };

  // Formatar valor monetário
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Formatar minutos para horas/minutos
  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Carregando configurações...</span>
      </div>
    );
  }

  if (pedidos.length === 0) {
    return (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum pedido finalizado</h3>
          <p className="text-gray-500">Não há pedidos com status "concluído" no momento.</p>
        </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pedido
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Criação
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Conclusão
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  Tempo Total
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Qtd Produtos
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  Custo Total
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Detalhes
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pedidos.map((pedido) => {
              const isExpanded = expandedRows[pedido.id];
              const costs = calculateCosts(pedido.id);
              const times = serviceTimes[pedido.id];
              
              return (
                <React.Fragment key={pedido.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{pedido.numero}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(pedido.dataCriacao)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(pedido.dataConclusao)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {calculateTotalTime(pedido)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {calculateTotalProducts(pedido)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {loadingCosts[pedido.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      ) : costs ? (
                        <span className="text-green-600">{formatCurrency(costs.total)}</span>
                      ) : (
                        <button
                          onClick={() => fetchServiceTimes(pedido.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Calcular custo
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Concluído
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => toggleRow(pedido.id)}
                        className="flex items-center text-blue-600 hover:text-blue-800"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-1" />
                            Ocultar
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1" />
                            Ver detalhes
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="space-y-4">
                          {/* Detalhes dos produtos */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Produtos do Pedido</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {pedido.produtos.map((produto, index) => (
                                <div key={index} className="bg-white p-3 rounded border">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{produto.nomeProduto}</span>
                                    <span className="text-gray-600">x{produto.quantidade}</span>
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {produto.tipo} • SKU: {produto.skuProduto}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Detalhes de custos */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Detalhamento de Custos</h4>
                            {loadingCosts[pedido.id] ? (
                              <div className="flex items-center">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500 mr-2" />
                                <span className="text-gray-600">Calculando custos...</span>
                              </div>
                            ) : costs && times ? (
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-white p-3 rounded border">
                                  <div className="text-sm text-gray-500">Impressão 3D</div>
                                  <div className="font-medium">{formatMinutes(times.impressao3d)}</div>
                                  <div className="text-green-600">{formatCurrency(costs.impressao3d)}</div>
                                </div>
                                <div className="bg-white p-3 rounded border">
                                  <div className="text-sm text-gray-500">Montagem</div>
                                  <div className="font-medium">{formatMinutes(times.montagem)}</div>
                                  <div className="text-green-600">{formatCurrency(costs.montagem)}</div>
                                </div>
                                <div className="bg-white p-3 rounded border">
                                  <div className="text-sm text-gray-500">Embalagem</div>
                                  <div className="font-medium">{formatMinutes(times.embalagem)}</div>
                                  <div className="text-green-600">{formatCurrency(costs.embalagem)}</div>
                                </div>
                                <div className="bg-white p-3 rounded border border-green-200 bg-green-50">
                                  <div className="text-sm text-gray-500">Total</div>
                                  <div className="font-medium text-lg text-green-700">
                                    {formatCurrency(costs.total)}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm">
                                <p>Nenhum dado de serviço encontrado para este pedido.</p>
                                <button
                                  onClick={() => fetchServiceTimes(pedido.id)}
                                  className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                                >
                                  Buscar dados de serviço
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CompletedOrdersTable;

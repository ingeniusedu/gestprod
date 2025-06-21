import { useState } from 'react';
import { Download, FileText, BarChart3, Calendar, Filter } from 'lucide-react';

export default function Relatorios() {
  const [selectedPeriod, setSelectedPeriod] = useState('mes');
  const [selectedReport, setSelectedReport] = useState('producao');

  // Dados simulados - será substituído por dados reais do Firebase
  const relatoriosDisponiveis = [
    {
      id: 'producao',
      nome: 'Relatório de Produção',
      descricao: 'Análise detalhada da produção por período',
      icon: BarChart3,
      formatos: ['PDF', 'Excel']
    },
    {
      id: 'custos',
      nome: 'Relatório de Custos',
      descricao: 'Breakdown de custos por pedido e produto',
      icon: FileText,
      formatos: ['PDF', 'Excel']
    },
    {
      id: 'estoque',
      nome: 'Relatório de Estoque',
      descricao: 'Status atual e movimentações de estoque',
      icon: Filter,
      formatos: ['PDF', 'Excel', 'CSV']
    },
    {
      id: 'financeiro',
      nome: 'Relatório Financeiro',
      descricao: 'Receitas, custos e margem de lucro',
      icon: Calendar,
      formatos: ['PDF', 'Excel']
    }
  ];

  const dadosProducao = {
    pedidosConcluidos: 45,
    pedidosEmAndamento: 12,
    tempoTotalProducao: 156.5,
    custoTotalInsumos: 2850.50,
    receitaTotal: 4275.75,
    margemLucro: 33.4
  };

  const topProdutos = [
    { nome: 'Kit Sistema Solar', quantidade: 15, receita: 1250.00 },
    { nome: 'Modelo Átomo', quantidade: 28, receita: 980.50 },
    { nome: 'Kit Anatomia', quantidade: 8, receita: 720.00 },
    { nome: 'Modelo DNA', quantidade: 12, receita: 650.75 }
  ];

  const handleGenerateReport = (reportId, formato) => {
    // Aqui seria implementada a lógica de geração do relatório
    console.log(`Gerando relatório ${reportId} em formato ${formato}`);
    // Simulação de download
    alert(`Relatório ${reportId} em ${formato} será baixado em breve!`);
  };

  const handleExportData = () => {
    // Aqui seria implementada a lógica de backup/exportação
    console.log('Exportando dados...');
    alert('Backup dos dados será iniciado!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios e Análises</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gere relatórios detalhados e análises de performance
          </p>
        </div>
        <button 
          onClick={handleExportData}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Download className="h-4 w-4 mr-2" />
          Backup Completo
        </button>
      </div>

      {/* Filtros de Período */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Período de Análise</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[
            { value: 'semana', label: 'Última Semana' },
            { value: 'mes', label: 'Último Mês' },
            { value: 'trimestre', label: 'Último Trimestre' },
            { value: 'ano', label: 'Último Ano' }
          ].map((period) => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value)}
              className={`p-3 text-sm font-medium rounded-lg border ${
                selectedPeriod === period.value
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas Resumidas */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Pedidos Concluídos
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {dadosProducao.pedidosConcluidos}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Calendar className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Tempo Total (horas)
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {dadosProducao.tempoTotalProducao}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileText className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Margem de Lucro
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {dadosProducao.margemLucro}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Relatórios Disponíveis */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">Relatórios Disponíveis</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {relatoriosDisponiveis.map((relatorio) => {
            const Icon = relatorio.icon;
            return (
              <div key={relatorio.id} className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center mb-4">
                  <Icon className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">
                      {relatorio.nome}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {relatorio.descricao}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {relatorio.formatos.map((formato) => (
                    <button
                      key={formato}
                      onClick={() => handleGenerateReport(relatorio.id, formato)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {formato}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Produtos */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Produtos Mais Vendidos ({selectedPeriod})
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Produto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantidade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Receita
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Participação
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topProdutos.map((produto, index) => {
                const participacao = (produto.receita / dadosProducao.receitaTotal) * 100;
                return (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {produto.nome}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {produto.quantidade} unidades
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      R$ {produto.receita.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${participacao}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">
                          {participacao.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Análise Financeira */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Análise Financeira</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Receita Total</span>
              <span className="text-lg font-semibold text-green-600">
                R$ {dadosProducao.receitaTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Custo Total</span>
              <span className="text-lg font-semibold text-red-600">
                R$ {dadosProducao.custoTotalInsumos.toFixed(2)}
              </span>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-900">Lucro Líquido</span>
                <span className="text-xl font-bold text-blue-600">
                  R$ {(dadosProducao.receitaTotal - dadosProducao.custoTotalInsumos).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Eficiência de Produção</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Tempo Médio por Pedido</span>
              <span className="text-lg font-semibold text-gray-900">
                {(dadosProducao.tempoTotalProducao / dadosProducao.pedidosConcluidos).toFixed(1)}h
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Custo Médio por Pedido</span>
              <span className="text-lg font-semibold text-gray-900">
                R$ {(dadosProducao.custoTotalInsumos / dadosProducao.pedidosConcluidos).toFixed(2)}
              </span>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-900">Receita por Hora</span>
                <span className="text-xl font-bold text-green-600">
                  R$ {(dadosProducao.receitaTotal / dadosProducao.tempoTotalProducao).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

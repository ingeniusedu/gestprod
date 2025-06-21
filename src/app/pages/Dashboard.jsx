import { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Package, 
  AlertTriangle, 
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3
} from 'lucide-react';

// Componente de Card de Métrica
function MetricCard({ title, value, icon: Icon, color = 'blue', trend = null }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`p-3 rounded-md ${colorClasses[color]}`}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">{value}</div>
                {trend && (
                  <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                    trend > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <TrendingUp className="self-center flex-shrink-0 h-4 w-4" />
                    <span className="ml-1">{Math.abs(trend)}%</span>
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente de Alerta de Estoque
function AlertaEstoque({ alertas }) {
  if (!alertas || alertas.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Alertas de Estoque</h3>
        <div className="text-center py-4">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
          <p className="mt-2 text-sm text-gray-500">Todos os estoques estão adequados</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Alertas de Estoque</h3>
      <div className="space-y-3">
        {alertas.map((alerta, index) => (
          <div key={index} className="flex items-center p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{alerta.nome}</p>
              <p className="text-sm text-gray-500">
                Estoque: {alerta.estoqueAtual} / Mínimo: {alerta.estoqueMinimo}
              </p>
            </div>
            <div className="text-sm font-medium text-red-600">
              {alerta.percentualRestante}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Componente de Pedidos Recentes
function PedidosRecentes({ pedidos }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'aguardando':
        return 'bg-yellow-100 text-yellow-800';
      case 'em_producao':
        return 'bg-blue-100 text-blue-800';
      case 'concluido':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'aguardando':
        return Clock;
      case 'em_producao':
        return Package;
      case 'concluido':
        return CheckCircle;
      default:
        return XCircle;
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Pedidos Recentes</h3>
      {pedidos && pedidos.length > 0 ? (
        <div className="space-y-3">
          {pedidos.map((pedido, index) => {
            const StatusIcon = getStatusIcon(pedido.status);
            return (
              <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <StatusIcon className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">#{pedido.numero}</p>
                    <p className="text-sm text-gray-500">{pedido.comprador}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(pedido.status)}`}>
                    {pedido.status.replace('_', ' ')}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    R$ {pedido.custos?.total?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">Nenhum pedido encontrado</p>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    pedidosEmAndamento: 0,
    pedidosConcluidos: 0,
    insumosComEstoqueBaixo: 0,
    custoTotalMes: 0,
    receitaTotalMes: 0,
  });

  const [alertasEstoque, setAlertasEstoque] = useState([]);
  const [pedidosRecentes, setPedidosRecentes] = useState([]);

  // Simulação de dados - será substituído por dados reais do Firebase
  useEffect(() => {
    // Dados simulados para demonstração
    setMetrics({
      pedidosEmAndamento: 12,
      pedidosConcluidos: 45,
      insumosComEstoqueBaixo: 3,
      custoTotalMes: 2850.50,
      receitaTotalMes: 4275.75,
    });

    setAlertasEstoque([
      {
        nome: 'Filamento PLA Azul',
        estoqueAtual: 0.5,
        estoqueMinimo: 2.0,
        percentualRestante: 25,
      },
      {
        nome: 'Imãs 10mm',
        estoqueAtual: 15,
        estoqueMinimo: 50,
        percentualRestante: 30,
      },
      {
        nome: 'Cola Instantânea',
        estoqueAtual: 2,
        estoqueMinimo: 5,
        percentualRestante: 40,
      },
    ]);

    setPedidosRecentes([
      {
        numero: '2025-001',
        comprador: 'Escola Municipal ABC',
        status: 'em_producao',
        custos: { total: 450.00 },
      },
      {
        numero: '2025-002',
        comprador: 'Colégio XYZ',
        status: 'aguardando',
        custos: { total: 320.50 },
      },
      {
        numero: '2024-158',
        comprador: 'Instituto DEF',
        status: 'concluido',
        custos: { total: 680.75 },
      },
    ]);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visão geral do sistema de gestão de produção 3D
        </p>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Pedidos em Andamento"
          value={metrics.pedidosEmAndamento}
          icon={ShoppingCart}
          color="blue"
        />
        <MetricCard
          title="Pedidos Concluídos"
          value={metrics.pedidosConcluidos}
          icon={CheckCircle}
          color="green"
          trend={12}
        />
        <MetricCard
          title="Alertas de Estoque"
          value={metrics.insumosComEstoqueBaixo}
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard
          title="Receita do Mês"
          value={`R$ ${metrics.receitaTotalMes.toFixed(2)}`}
          icon={DollarSign}
          color="green"
          trend={8}
        />
      </div>

      {/* Conteúdo principal */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alertas de Estoque */}
        <AlertaEstoque alertas={alertasEstoque} />

        {/* Pedidos Recentes */}
        <PedidosRecentes pedidos={pedidosRecentes} />
      </div>

      {/* Gráfico de Produção (placeholder) */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Produção dos Últimos 30 Dias</h3>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">Gráfico será implementado na próxima fase</p>
          </div>
        </div>
      </div>
    </div>
  );
}

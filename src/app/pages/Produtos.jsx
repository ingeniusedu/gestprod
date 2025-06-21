import { useState } from 'react';
import { Plus, Search, Package, Layers, Box } from 'lucide-react';

export default function Produtos() {
  const [activeTab, setActiveTab] = useState('kits');
  const [searchTerm, setSearchTerm] = useState('');

  // Dados simulados - será substituído por dados reais do Firebase
  const produtos = {
    kits: [
      {
        id: '1',
        sku: 'KIT-001',
        nome: 'Kit Sistema Solar',
        modelos: [
          { nome: 'Sol', quantidade: 1 },
          { nome: 'Planetas', quantidade: 8 }
        ],
        custoCalculado: 125.50,
        precoSugerido: 200.80,
        tempoMontagem: 2.5
      },
      {
        id: '2',
        sku: 'KIT-002',
        nome: 'Kit Anatomia Humana',
        modelos: [
          { nome: 'Coração', quantidade: 1 },
          { nome: 'Pulmões', quantidade: 2 },
          { nome: 'Esqueleto', quantidade: 1 }
        ],
        custoCalculado: 89.30,
        precoSugerido: 142.88,
        tempoMontagem: 3.0
      }
    ],
    modelos: [
      {
        id: '1',
        sku: 'MOD-001',
        nome: 'Modelo Átomo de Carbono',
        pecas: [
          { nome: 'Núcleo', quantidade: 1 },
          { nome: 'Elétron', quantidade: 6 }
        ],
        custoCalculado: 45.20,
        precoSugerido: 72.32,
        tempoImpressao: 4.5,
        tempoMontagem: 1.0
      },
      {
        id: '2',
        sku: 'MOD-002',
        nome: 'Modelo DNA',
        pecas: [
          { nome: 'Base Nitrogenada A', quantidade: 10 },
          { nome: 'Base Nitrogenada T', quantidade: 10 },
          { nome: 'Estrutura Helicoidal', quantidade: 2 }
        ],
        custoCalculado: 67.80,
        precoSugerido: 108.48,
        tempoImpressao: 6.0,
        tempoMontagem: 2.0
      }
    ],
    pecas: [
      {
        id: '1',
        sku: 'PEC-001',
        nome: 'Núcleo Atômico',
        insumos: [
          { nome: 'Filamento PLA Vermelho', quantidade: 0.05 },
          { nome: 'Tempo de Impressão', quantidade: 0.5 }
        ],
        custoCalculado: 8.50,
        precoSugerido: 13.60,
        tempoImpressao: 0.5,
        tempoMontagem: 0.1
      },
      {
        id: '2',
        sku: 'PEC-002',
        nome: 'Elétron',
        insumos: [
          { nome: 'Filamento PLA Azul', quantidade: 0.02 },
          { nome: 'Tempo de Impressão', quantidade: 0.2 }
        ],
        custoCalculado: 3.20,
        precoSugerido: 5.12,
        tempoImpressao: 0.2,
        tempoMontagem: 0.05
      }
    ]
  };

  const tabs = [
    { id: 'kits', name: 'Kits', icon: Box, count: produtos.kits.length },
    { id: 'modelos', name: 'Modelos', icon: Layers, count: produtos.modelos.length },
    { id: 'pecas', name: 'Peças', icon: Package, count: produtos.pecas.length }
  ];

  const filteredProdutos = produtos[activeTab].filter(produto =>
    produto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    produto.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderKitCard = (kit) => (
    <div key={kit.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{kit.nome}</h3>
          <p className="text-sm text-gray-500">SKU: {kit.sku}</p>
        </div>
        <Box className="h-8 w-8 text-blue-500" />
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="text-sm text-gray-600">
          <strong>Modelos inclusos:</strong>
        </div>
        {kit.modelos.map((modelo, index) => (
          <div key={index} className="text-sm text-gray-500 ml-2">
            • {modelo.nome} (x{modelo.quantidade})
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Custo:</span>
          <div className="font-medium text-gray-900">R$ {kit.custoCalculado.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-500">Preço Sugerido:</span>
          <div className="font-medium text-green-600">R$ {kit.precoSugerido.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Montagem:</span>
          <div className="font-medium text-gray-900">{kit.tempoMontagem}h</div>
        </div>
        <div>
          <span className="text-gray-500">Margem:</span>
          <div className="font-medium text-blue-600">
            {(((kit.precoSugerido - kit.custoCalculado) / kit.custoCalculado) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );

  const renderModeloCard = (modelo) => (
    <div key={modelo.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{modelo.nome}</h3>
          <p className="text-sm text-gray-500">SKU: {modelo.sku}</p>
        </div>
        <Layers className="h-8 w-8 text-green-500" />
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="text-sm text-gray-600">
          <strong>Peças necessárias:</strong>
        </div>
        {modelo.pecas.map((peca, index) => (
          <div key={index} className="text-sm text-gray-500 ml-2">
            • {peca.nome} (x{peca.quantidade})
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Custo:</span>
          <div className="font-medium text-gray-900">R$ {modelo.custoCalculado.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-500">Preço Sugerido:</span>
          <div className="font-medium text-green-600">R$ {modelo.precoSugerido.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Impressão:</span>
          <div className="font-medium text-gray-900">{modelo.tempoImpressao}h</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Montagem:</span>
          <div className="font-medium text-gray-900">{modelo.tempoMontagem}h</div>
        </div>
      </div>
    </div>
  );

  const renderPecaCard = (peca) => (
    <div key={peca.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{peca.nome}</h3>
          <p className="text-sm text-gray-500">SKU: {peca.sku}</p>
        </div>
        <Package className="h-8 w-8 text-purple-500" />
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="text-sm text-gray-600">
          <strong>Insumos necessários:</strong>
        </div>
        {peca.insumos.map((insumo, index) => (
          <div key={index} className="text-sm text-gray-500 ml-2">
            • {insumo.nome} ({insumo.quantidade})
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Custo:</span>
          <div className="font-medium text-gray-900">R$ {peca.custoCalculado.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-500">Preço Sugerido:</span>
          <div className="font-medium text-green-600">R$ {peca.precoSugerido.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Impressão:</span>
          <div className="font-medium text-gray-900">{peca.tempoImpressao}h</div>
        </div>
        <div>
          <span className="text-gray-500">Tempo Montagem:</span>
          <div className="font-medium text-gray-900">{peca.tempoMontagem}h</div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'kits':
        return filteredProdutos.map(renderKitCard);
      case 'modelos':
        return filteredProdutos.map(renderModeloCard);
      case 'pecas':
        return filteredProdutos.map(renderPecaCard);
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie kits, modelos e peças do catálogo
          </p>
        </div>
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.name}
                  <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Busca */}
        <div className="p-6 border-b border-gray-200">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      {filteredProdutos.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {renderContent()}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-12">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum produto encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tente ajustar o termo de busca ou criar um novo produto.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { LocalProduto, LocalInsumo, Recipiente, OcupanteDivisao } from '../types/mapaEstoque';
import { Produto } from '../types';

interface StorageDivisionViewProps {
  local: LocalProduto | LocalInsumo;
  recipientes: Recipiente[];
  produtos: Produto[];
}

const StorageDivisionView: React.FC<StorageDivisionViewProps> = ({ local, recipientes, produtos }) => {
  if (!local.divisoes) return <p>Configuração de divisão inválida.</p>;

  const { h: rows, v: cols } = local.divisoes;

  const getDivisionContent = (row: number, col: number) => {
    if (local.collectionType === 'locaisInsumos' && (local as LocalInsumo).ocupantes) {
      const ocupantesNaDivisao = (local as LocalInsumo).ocupantes!.filter(
        (ocupante: OcupanteDivisao) => ocupante.divisao.h === row && ocupante.divisao.v === col
      );

      if (ocupantesNaDivisao.length > 0) {
        return (
          <div className="p-2 text-xs text-gray-700">
            {ocupantesNaDivisao.map((ocupante, index) => {
              const insumo = produtos.find(p => p.id === ocupante.insumoId);
              const recipiente = recipientes.find(r => r.id === ocupante.recipienteId);
              return (
                <div key={index} className="mb-1">
                  <p className="font-semibold">{insumo?.nome || 'Insumo Desconhecido'}</p>
                  <p>Qtde: {ocupante.quantidade}</p>
                  <p>Recipiente: {recipiente?.nome || 'Desconhecido'}</p>
                </div>
              );
            })}
          </div>
        );
      }
    }
    return <p className="text-gray-500 text-sm">Divisão ({row + 1}, {col + 1})</p>;
  };

  const renderDivisions = () => {
    const divisions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        divisions.push(
          <div
            key={`${r}-${c}`}
            className="border border-gray-300 flex flex-col justify-center items-center p-2 overflow-hidden text-center"
            style={{ minHeight: '100px' }}
          >
            {getDivisionContent(r, c)}
          </div>
        );
      }
    }
    return divisions;
  };

  return (
    <div
      className="grid gap-2 p-4 bg-gray-100"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {renderDivisions()}
    </div>
  );
};

export default StorageDivisionView;

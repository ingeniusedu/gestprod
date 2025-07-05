export interface ModeloRecipiente {
  id?: string;
  nome: string;
  tipo: 'bandeja' | 'caixa' | 'pote' | 'outro';
  dimensoes: {
    x: number;
    y: number;
    z: number;
  };
  divisoes?: {
    horizontais: number;
    verticais: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

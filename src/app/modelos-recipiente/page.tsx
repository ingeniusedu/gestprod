"use client";

import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { db, auth } from '../services/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { ModeloRecipiente } from '../types/modeloRecipiente';
import ModeloRecipienteFormModal from '../components/ModeloRecipienteFormModal';

export default function ModelosRecipientePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelos, setModelos] = useState<ModeloRecipiente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modeloToEdit, setModeloToEdit] = useState<ModeloRecipiente | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchModelos();
      } else {
        setModelos([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchModelos = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'modelosRecipiente'));
      const modelosList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ModeloRecipiente[];
      setModelos(modelosList);
    } catch (error) {
      console.error("Error fetching recipient templates: ", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (modeloData: ModeloRecipiente) => {
    try {
      if (modeloData.id) {
        const modeloRef = doc(db, 'modelosRecipiente', modeloData.id);
        await updateDoc(modeloRef, { ...modeloData, updatedAt: new Date() });
      } else {
        const { id, ...dataToSave } = modeloData;
        await addDoc(collection(db, 'modelosRecipiente'), { ...dataToSave, createdAt: new Date() });
      }
      setIsModalOpen(false);
      setModeloToEdit(null);
      fetchModelos();
    } catch (error) {
      console.error("Error saving recipient template: ", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja deletar este modelo?")) {
      try {
        await deleteDoc(doc(db, 'modelosRecipiente', id));
        fetchModelos();
      } catch (error) {
        console.error("Error deleting recipient template: ", error);
      }
    }
  };

  const openModal = (modelo?: ModeloRecipiente) => {
    setModeloToEdit(modelo || null);
    setIsModalOpen(true);
  };

  if (loading) {
    return <Layout><p>Carregando...</p></Layout>;
  }

  if (!currentUser) {
    return <Layout><p>Acesso negado. Por favor, faça login.</p></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Modelos de Recipiente</h1>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Modelo
          </button>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dimensões</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Divisões</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {modelos.map((modelo) => (
                <tr key={modelo.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{modelo.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{modelo.tipo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{`${modelo.dimensoes.x}x${modelo.dimensoes.y}x${modelo.dimensoes.z}`}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{`${modelo.divisoes?.horizontais || 1}x${modelo.divisoes?.verticais || 1}`}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => openModal(modelo)} className="text-blue-600 hover:text-blue-900"><Edit size={18} /></button>
                    <button onClick={() => handleDelete(modelo.id!)} className="text-red-600 hover:text-red-900 ml-4"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ModeloRecipienteFormModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setModeloToEdit(null);
          }}
          onSave={handleSave}
          initialData={modeloToEdit}
        />
      )}
    </Layout>
  );
}

// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// IMPORTANT: Ensure these environment variables are set in your .env.local file
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Firestore operations for Partes
const partesCollectionRef = collection(db, 'partes');

export const addParte = async (parteData) => {
  try {
    // Prioritize existing identificador, otherwise derive from SKU
    const identificador = parteData.identificador || (parteData.sku ? parteData.sku.split('-').pop() : '');
    const dataToSave = { ...parteData, identificador };
    const docRef = await addDoc(partesCollectionRef, dataToSave);
    return { id: docRef.id, ...dataToSave };
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const getPartes = async () => {
  try {
    const querySnapshot = await getDocs(partesCollectionRef);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const posicoes = data.posicoesEstoque || [];
      const estoqueTotal = posicoes.reduce((acc, pos) => acc + pos.quantidade, 0);
      return { id: doc.id, ...data, estoqueTotal };
    });
  } catch (e) {
    console.error("Error getting documents: ", e);
    throw e;
  }
};

export const updateParte = async (id, parteData) => {
  try {
    // Prioritize existing identificador, otherwise derive from SKU
    const identificador = parteData.identificador || (parteData.sku ? parteData.sku.split('-').pop() : '');
    const dataToUpdate = { ...parteData, identificador };
    const parteDocRef = doc(db, 'partes', id);
    await updateDoc(parteDocRef, dataToUpdate);
    return { id, ...dataToUpdate };
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const deleteParte = async (id) => {
  try {
    const parteDocRef = doc(db, 'partes', id);
    await deleteDoc(parteDocRef);
    return true;
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const deletePartes = async (ids) => {
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      const parteDocRef = doc(db, 'partes', id);
      batch.delete(parteDocRef);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error deleting documents: ", e);
    throw e;
  }
};

// Firestore operations for Pecas
const pecasCollectionRef = collection(db, 'pecas');

export const addPeca = async (pecaData) => {
  try {
    const docRef = await addDoc(pecasCollectionRef, { ...pecaData, createdAt: new Date(), updatedAt: new Date() });
    return { id: docRef.id, ...pecaData };
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const getPecas = async () => {
  try {
    const querySnapshot = await getDocs(pecasCollectionRef);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const posicoes = data.posicoesEstoque || [];
      const estoqueTotal = posicoes.reduce((acc, pos) => acc + pos.quantidade, 0);
      return { id: doc.id, ...data, estoqueTotal };
    });
  } catch (e) {
    console.error("Error getting documents: ", e);
    throw e;
  }
};

export const updatePeca = async (id, pecaData) => {
  try {
    const pecaDocRef = doc(db, 'pecas', id);
    await updateDoc(pecaDocRef, { ...pecaData, updatedAt: new Date() });
    return { id, ...pecaData };
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const deletePeca = async (id) => {
  try {
    const pecaDocRef = doc(db, 'pecas', id);
    await deleteDoc(pecaDocRef);
    return true;
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const deletePecas = async (ids) => {
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      const pecaDocRef = doc(db, 'pecas', id);
      batch.delete(pecaDocRef);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error deleting documents: ", e);
    throw e;
  }
};

// Firestore operations for Modelos
const modelosCollectionRef = collection(db, 'modelos');

export const addModelo = async (modeloData) => {
  try {
    const docRef = await addDoc(modelosCollectionRef, { ...modeloData, createdAt: new Date(), updatedAt: new Date() });
    return { id: docRef.id, ...modeloData };
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const getModelos = async () => {
  try {
    const querySnapshot = await getDocs(modelosCollectionRef);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const posicoes = data.posicoesEstoque || [];
      const estoqueTotal = posicoes.reduce((acc, pos) => acc + pos.quantidade, 0);
      return { id: doc.id, ...data, estoqueTotal };
    });
  } catch (e) {
    console.error("Error getting documents: ", e);
    throw e;
  }
};

export const updateModelo = async (id, modeloData) => {
  try {
    const modeloDocRef = doc(db, 'modelos', id);
    await updateDoc(modeloDocRef, { ...modeloData, updatedAt: new Date() });
    return { id, ...modeloData };
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const deleteModelo = async (id) => {
  try {
    const modeloDocRef = doc(db, 'modelos', id);
    await deleteDoc(modeloDocRef);
    return true;
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const deleteModelos = async (ids) => {
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      const modeloDocRef = doc(db, 'modelos', id);
      batch.delete(modeloDocRef);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error deleting documents: ", e);
    throw e;
  }
};

// Firestore operations for Kits
const kitsCollectionRef = collection(db, 'kits');

export const addKit = async (kitData) => {
  try {
    const docRef = await addDoc(kitsCollectionRef, { ...kitData, createdAt: new Date(), updatedAt: new Date() });
    return { id: docRef.id, ...kitData };
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const getKits = async () => {
  try {
    const querySnapshot = await getDocs(kitsCollectionRef);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const posicoes = data.posicoesEstoque || [];
      const estoqueTotal = posicoes.reduce((acc, pos) => acc + pos.quantidade, 0);
      return { id: doc.id, ...data, estoqueTotal };
    });
  } catch (e) {
    console.error("Error getting documents: ", e);
    throw e;
  }
};

export const updateKit = async (id, kitData) => {
  try {
    const kitDocRef = doc(db, 'kits', id);
    await updateDoc(kitDocRef, { ...kitData, updatedAt: new Date() });
    return { id, ...kitData };
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const deleteKit = async (id) => {
  try {
    const kitDocRef = doc(db, 'kits', id);
    await deleteDoc(kitDocRef);
    return true;
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const deleteKits = async (ids) => {
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      const kitDocRef = doc(db, 'kits', id);
      batch.delete(kitDocRef);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error deleting documents: ", e);
    throw e;
  }
};

// Firestore operations for Insumos
const insumosCollectionRef = collection(db, 'insumos');

export const addInsumo = async (insumoData) => {
  try {
    const docRef = await addDoc(insumosCollectionRef, { ...insumoData, createdAt: new Date(), updatedAt: new Date() });
    return { id: docRef.id, ...insumoData };
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const getInsumos = async () => {
  try {
    const querySnapshot = await getDocs(insumosCollectionRef);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const posicoes = data.posicoesEstoque || [];
      const estoqueTotal = posicoes.reduce((acc, pos) => acc + pos.quantidade, 0);
      return { id: doc.id, ...data, estoqueTotal };
    });
  } catch (e) {
    console.error("Error getting documents: ", e);
    throw e;
  }
};

export const updateInsumo = async (id, insumoData) => {
  try {
    const insumoDocRef = doc(db, 'insumos', id);
    await updateDoc(insumoDocRef, { ...insumoData, updatedAt: new Date() });
    return { id, ...insumoData };
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const deleteInsumo = async (id) => {
  try {
    const insumoDocRef = doc(db, 'insumos', id);
    await deleteDoc(insumoDocRef);
    return true;
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const deleteInsumos = async (ids) => {
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      const insumoDocRef = doc(db, 'insumos', id);
      batch.delete(insumoDocRef);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error deleting documents: ", e);
    throw e;
  }
};

// Firestore operations for LocaisDeEstoque
const locaisDeEstoqueCollectionRef = collection(db, 'locaisDeEstoque');

export const getLocaisDeEstoque = async () => {
  try {
    const querySnapshot = await getDocs(locaisDeEstoqueCollectionRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting locais de estoque: ", e);
    throw e;
  }
};

// Firestore operations for Recipientes
const recipientesCollectionRef = collection(db, 'recipientes');

export const getRecipientes = async () => {
  try {
    const querySnapshot = await getDocs(recipientesCollectionRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting recipientes: ", e);
    throw e;
  }
};

export default app;

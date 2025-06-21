"use client";

import React, { useState, useEffect } from 'react';
import { auth } from './services/firebase'; // Import auth from firebase.js
import { onAuthStateChanged, User } from 'firebase/auth'; // Import onAuthStateChanged, User
import AuthForm from './components/AuthForm'; // Import AuthForm
import { useRouter } from 'next/navigation'; // Import useRouter for redirection

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
      if (user) {
        // Redirect to a default authenticated page, e.g., /estoque
        router.push('/estoque');
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router]); // Add router to dependency array

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Carregando autenticação...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthForm />
    );
  }

  // If authenticated and not loading, this page should ideally redirect
  // or render a default dashboard. Since we're redirecting in useEffect,
  // this return will only be hit briefly or if there's no redirection.
  // For now, we can return null or a loading indicator if redirection hasn't happened yet.
  return null;
}

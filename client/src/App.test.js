import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from './App';

test('app renders the login page without crashing', async () => {
  // Use act to wrap the async render
  await act(async () => {
    render(<App />);
  });
  
  // [FIX 3 (TASK 2.2.2)]
  // The app correctly renders the Login page by default.
  // Let's look for the "Log In" heading.
  const loginHeading = await screen.findByRole('heading', {
    name: /log in/i,
  });
  expect(loginHeading).toBeInTheDocument();
});


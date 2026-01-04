import { NextRequest, NextResponse } from 'next/server';
import { erpLogin } from '@/lib/erp';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const result = await erpLogin(email, password);

    // Return success with user info
    // In a real app, you might want to generate a JWT token here
    return NextResponse.json({
      success: true,
      user: result.user,
      email: result.email,
    });
  } catch (e: any) {
    console.error('Login error:', e);
    
    // Hata mesajını kullanıcı dostu hale getir
    let errorMessage = 'Login failed. Please check your username and password.';
    
    if (e.message) {
      // Hata mesajlarını kontrol et
      if (e.message.includes('Invalid') || e.message.includes('username') || e.message.includes('password') || e.message.includes('AuthenticationError') || e.message.includes('Invalid login')) {
        errorMessage = 'Invalid username or password';
      } else if (e.message.includes('BrokenPipeError') || e.message.includes('connection') || e.message.includes('Broken pipe')) {
        errorMessage = 'Server connection error. Please try again.';
      } else {
        errorMessage = e.message;
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 401 }
    );
  }
}

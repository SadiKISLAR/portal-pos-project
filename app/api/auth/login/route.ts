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
    return NextResponse.json(
      { error: e.message || 'Login failed' },
      { status: 401 }
    );
  }
}

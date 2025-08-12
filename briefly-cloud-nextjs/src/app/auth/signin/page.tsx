import { redirect } from 'next/navigation'

export default function SignInRedirect() {
  redirect('/briefly/app/auth/signin')
}
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: { scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly' },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) token.access_token = account.access_token
      return token
    },
    async session({ session, token }) {
      // @ts-ignore
      session.access_token = token.access_token
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }

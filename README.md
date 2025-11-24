// 1️⃣ Intercepta a requisição
@UseGuards(JwtAuthGuard) // ← ESTE é chamado primeiro!

// 2️⃣ Chama internamente:
canActivate() {
  return super.canActivate(context); // ← Dispara a JwtStrategy
}


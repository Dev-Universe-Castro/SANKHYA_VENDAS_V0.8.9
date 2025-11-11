
import { NextResponse } from 'next/server'
import { oracleService } from '@/lib/oracle-db'
import { usersService } from '@/lib/users-service'
import { cookies } from 'next/headers'

export const revalidate = 60

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const dataInicio = searchParams.get('dataInicio') || undefined
    const dataFim = searchParams.get('dataFim') || undefined
    const numeroPedido = searchParams.get('numeroPedido') || undefined
    const nomeCliente = searchParams.get('nomeCliente') || undefined

    console.log('📋 Buscando pedidos do Oracle - userId:', userId, 'numeroPedido:', numeroPedido)

    // Tentar obter usuário do cookie se userId não for fornecido
    let usuario

    if (userId) {
      usuario = await usersService.getById(parseInt(userId))
    } else {
      const cookieStore = cookies()
      const userCookie = cookieStore.get('user')

      if (userCookie?.value) {
        try {
          usuario = JSON.parse(userCookie.value)
          console.log('✅ Usuário obtido do cookie:', { id: usuario.id, name: usuario.name })
        } catch (e) {
          console.error('Erro ao parsear cookie de usuário:', e)
        }
      }
    }

    if (!usuario) {
      console.error('❌ Usuário não autenticado - userId:', userId)
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      )
    }

    const idEmpresa = usuario.ID_EMPRESA

    if (!idEmpresa) {
      return NextResponse.json({ error: 'Empresa não identificada' }, { status: 400 })
    }

    console.log('👤 Tipo de usuário:', usuario.tipo || usuario.role)
    console.log('🔢 Código vendedor:', usuario.codVendedor)

    const tipoUsuario = usuario.tipo || usuario.role?.toLowerCase()

    // Construir query dinâmica
    const criterios: string[] = [
      'ID_SISTEMA = :idEmpresa',
      'SANKHYA_ATUAL = \'S\'',
      'TIPMOV = \'P\''
    ]

    const binds: any = { idEmpresa }

    // Filtro por tipo de usuário
    if (tipoUsuario === 'administrador') {
      console.log('🔓 Administrador - Listando todos os pedidos')
    } else if (tipoUsuario === 'gerente' && usuario.codVendedor) {
      console.log('👔 Gerente - Listando pedidos da equipe')
      // Buscar vendedores da equipe do gerente
      const vendedoresSql = `SELECT CODVEND FROM TGFVEN WHERE CODGER = :codGerente`
      const vendedores = await oracleService.executeQuery(vendedoresSql, { codGerente: usuario.codVendedor })
      const codVendedores = vendedores.map((v: any) => v.CODVEND)
      
      if (codVendedores.length > 0) {
        criterios.push(`CODVEND IN (${codVendedores.join(',')})`)
      } else {
        criterios.push('CODVEND = :codVendedor')
        binds.codVendedor = usuario.codVendedor
      }
    } else if (tipoUsuario === 'vendedor' && usuario.codVendedor) {
      console.log('💼 Vendedor - Listando pedidos próprios')
      criterios.push('CODVEND = :codVendedor')
      binds.codVendedor = usuario.codVendedor
    }

    // Filtros adicionais
    if (dataInicio) {
      criterios.push('DTNEG >= TO_DATE(:dataInicio, \'YYYY-MM-DD\')')
      binds.dataInicio = dataInicio
    }

    if (dataFim) {
      criterios.push('DTNEG <= TO_DATE(:dataFim, \'YYYY-MM-DD\')')
      binds.dataFim = dataFim
    }

    if (numeroPedido && numeroPedido.trim()) {
      criterios.push('NUNOTA = :numeroPedido')
      binds.numeroPedido = numeroPedido.trim()
    }

    if (nomeCliente && nomeCliente.trim()) {
      criterios.push('CODPARC = :codParc')
      binds.codParc = nomeCliente.trim()
    }

    const whereClause = criterios.join(' AND ')

    const sql = `
      SELECT 
        NUNOTA,
        CODPARC,
        CODVEND,
        VLRNOTA,
        DTNEG,
        CODTIPOPER,
        CODTIPVENDA
      FROM AS_CABECALHO_NOTA
      WHERE ${whereClause}
      ORDER BY DTNEG DESC, NUNOTA DESC
    `

    const pedidos = await oracleService.executeQuery(sql, binds)

    console.log(`✅ ${pedidos.length} pedidos encontrados no Oracle`)

    return NextResponse.json(pedidos, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      }
    })
  } catch (error: any) {
    console.error('Erro ao listar pedidos:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao listar pedidos' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { oracleService } from '@/lib/oracle-db'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const codParc = searchParams.get('codParceiro')
    const dataInicio = searchParams.get('dataNegociacaoInicio')
    const dataFim = searchParams.get('dataNegociacaoFinal')
    const tipoFinanceiro = searchParams.get('tipoFinanceiro') // 1=Pendente, 2=Baixado, 3=Todos
    const statusFinanceiro = searchParams.get('statusFinanceiro') // 1=Real, 2=Provisão, 3=Todos

    console.log('🔍 [FINANCEIRO] Parâmetros recebidos:', {
      codParc,
      dataInicio,
      dataFim,
      tipoFinanceiro,
      statusFinanceiro
    })

    // Obter usuário
    const cookieStore = cookies()
    const userCookie = cookieStore.get('user')

    if (!userCookie) {
      console.error('❌ [FINANCEIRO] Usuário não autenticado')
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 })
    }

    const user = JSON.parse(userCookie.value)
    const idEmpresa = user.ID_EMPRESA

    if (!idEmpresa) {
      console.error('❌ [FINANCEIRO] Empresa não identificada')
      return NextResponse.json({ error: 'Empresa não identificada' }, { status: 400 })
    }

    console.log('✅ [FINANCEIRO] ID Empresa:', idEmpresa)

    // Construir critérios de busca
    const criterios: string[] = ['ID_SISTEMA = :idEmpresa', 'SANKHYA_ATUAL = \'S\'']
    const binds: any = { idEmpresa }

    if (codParc) {
      criterios.push('CODPARC = :codParc')
      binds.codParc = codParc
      console.log('🔍 [FINANCEIRO] Filtrando por parceiro:', codParc)
    }

    if (dataInicio) {
      criterios.push('DTNEG >= TO_DATE(:dataInicio, \'YYYY-MM-DD\')')
      binds.dataInicio = dataInicio
      console.log('🔍 [FINANCEIRO] Data início:', dataInicio)
    }

    if (dataFim) {
      criterios.push('DTNEG <= TO_DATE(:dataFim, \'YYYY-MM-DD\')')
      binds.dataFim = dataFim
      console.log('🔍 [FINANCEIRO] Data fim:', dataFim)
    }

    // Filtro de Tipo Financeiro (Real/Provisão)
    if (statusFinanceiro && statusFinanceiro !== '3') {
      if (statusFinanceiro === '1') {
        criterios.push('PROVISAO = \'N\'')
        console.log('🔍 [FINANCEIRO] Filtrando: Real')
      } else if (statusFinanceiro === '2') {
        criterios.push('PROVISAO = \'S\'')
        console.log('🔍 [FINANCEIRO] Filtrando: Provisão')
      }
    }

    // Filtro de Status (Aberto/Baixado)
    if (tipoFinanceiro && tipoFinanceiro !== '3') {
      if (tipoFinanceiro === '1') {
        criterios.push('RECDESP = 1')
        console.log('🔍 [FINANCEIRO] Filtrando: Aberto')
      } else if (tipoFinanceiro === '2') {
        criterios.push('RECDESP = 0')
        console.log('🔍 [FINANCEIRO] Filtrando: Baixado')
      }
    }

    const whereClause = criterios.join(' AND ')
    console.log('📝 [FINANCEIRO] WHERE clause:', whereClause)

    const sql = `
      SELECT 
        NUFIN,
        CODPARC,
        NOMEPARC,
        DTVENC,
        VLRDESDOB,
        VLRBAIXA,
        VLRJURO,
        PROVISAO,
        RECDESP,
        DTNEG,
        NUNOTA,
        NUMNOTA,
        CODTIPOPER,
        DESDOBRAMENTO
      FROM AS_FINANCEIRO
      WHERE ${whereClause}
      ORDER BY DTVENC DESC
    `

    console.log('📊 [FINANCEIRO] Executando query...')
    const titulos = await oracleService.executeQuery(sql, binds)
    console.log(`✅ [FINANCEIRO] ${titulos.length} títulos retornados do banco`)

    if (titulos.length > 0) {
      console.log('📋 [FINANCEIRO] Primeiro título (amostra):', JSON.stringify(titulos[0], null, 2))
    }

    // Calcular totais
    let totalReal = 0
    let totalProvisao = 0
    let totalAberto = 0
    let totalBaixado = 0

    titulos.forEach((t: any, index: number) => {
      if (index < 3) {
        console.log(`📊 [FINANCEIRO] Título ${index}:`, {
          NUFIN: t.NUFIN,
          VLRDESDOB: t.VLRDESDOB,
          VLRBAIXA: t.VLRBAIXA,
          PROVISAO: t.PROVISAO,
          RECDESP: t.RECDESP
        })
      }

      if (t.PROVISAO === 'N') {
        totalReal++
      } else {
        totalProvisao++
      }

      if (t.RECDESP === 1) {
        totalAberto++
      } else {
        totalBaixado++
      }
    })

    console.log('📊 [FINANCEIRO] Totais calculados:', {
      totalReal,
      totalProvisao,
      totalAberto,
      totalBaixado
    })

    return NextResponse.json({
      titulos,
      totais: {
        real: totalReal,
        provisao: totalProvisao,
        aberto: totalAberto,
        baixado: totalBaixado
      }
    })

  } catch (error: any) {
    console.error('❌ [FINANCEIRO] Erro ao buscar títulos:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

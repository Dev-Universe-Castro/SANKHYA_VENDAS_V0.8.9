
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { oracleService } from '@/lib/oracle-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const searchName = searchParams.get('searchName') || '';
    const searchCode = searchParams.get('searchCode') || '';

    // Obter o usuário logado
    const cookieStore = cookies();
    const userCookie = cookieStore.get('user');

    if (!userCookie) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
    }

    const user = JSON.parse(userCookie.value);
    const idEmpresa = user.ID_EMPRESA;

    if (!idEmpresa) {
      return NextResponse.json({ error: 'Empresa não identificada' }, { status: 400 });
    }

    const userCodVend = user.codVendedor ? parseInt(user.codVendedor) : null;

    console.log('👤 Usuário:', { id: user.id, name: user.name, role: user.role, codVendedor: userCodVend });

    // Construir critérios de busca
    const criterios: string[] = [
      'ID_SISTEMA = :idEmpresa',
      'SANKHYA_ATUAL = \'S\'',
      'CLIENTE = \'S\''
    ];

    const binds: any = { idEmpresa };

    // Filtro por vendedor
    if (user.role === 'Vendedor' && userCodVend) {
      criterios.push('CODVEND = :codVendedor');
      binds.codVendedor = userCodVend;
    } else if (user.role === 'Gerente' && userCodVend) {
      // Buscar vendedores da equipe
      const vendedoresSql = 'SELECT CODVEND FROM TGFVEN WHERE CODGER = :codGerente';
      const vendedores = await oracleService.executeQuery(vendedoresSql, { codGerente: userCodVend });
      const codVendedores = vendedores.map((v: any) => v.CODVEND);
      
      if (codVendedores.length > 0) {
        criterios.push(`CODVEND IN (${codVendedores.join(',')})`);
      }
    }

    // Filtros de busca
    if (searchName && searchName.trim()) {
      criterios.push('(UPPER(NOMEPARC) LIKE :searchName OR UPPER(RAZAOSOCIAL) LIKE :searchName)');
      binds.searchName = `%${searchName.toUpperCase()}%`;
    }

    if (searchCode && searchCode.trim()) {
      criterios.push('CODPARC = :searchCode');
      binds.searchCode = searchCode.trim();
    }

    const whereClause = criterios.join(' AND ');
    const offset = (page - 1) * pageSize;

    const sql = `
      SELECT 
        CODPARC,
        NOMEPARC,
        RAZAOSOCIAL,
        CGC_CPF,
        CLIENTE,
        ATIVO,
        CODCID,
        CODVEND,
        TIPPESSOA
      FROM AS_PARCEIROS
      WHERE ${whereClause}
      ORDER BY NOMEPARC
      OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
    `;

    binds.offset = offset;
    binds.pageSize = pageSize;

    const parceiros = await oracleService.executeQuery(sql, binds);

    // Contar total
    const countSql = `SELECT COUNT(*) as TOTAL FROM AS_PARCEIROS WHERE ${whereClause}`;
    const countResult = await oracleService.executeOne(countSql, binds);
    const total = parseInt(countResult?.TOTAL || '0');

    console.log(`✅ ${parceiros.length} parceiros encontrados no Oracle`);

    return NextResponse.json({
      parceiros,
      total,
      page,
      pageSize
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar parceiros:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

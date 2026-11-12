package com.kopens.factory3d.model;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/** text[] ↔ List&lt;String&gt; */
public class TextArrayHandler extends BaseTypeHandler<List<String>> {
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> v, JdbcType t) throws SQLException {
        ps.setArray(i, ps.getConnection().createArrayOf("text", v.toArray()));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, String col) throws SQLException {
        return of(rs.getArray(col));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int i) throws SQLException {
        return of(rs.getArray(i));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int i) throws SQLException {
        return of(cs.getArray(i));
    }

    private static List<String> of(Array a) throws SQLException {
        return a == null ? List.of() : Arrays.asList((String[]) a.getArray());
    }
}

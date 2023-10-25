import merge from 'lodash/merge';
import buildDataProvider, {
    BuildQueryFactory,
    Options,
    introspectSchema,
    IntrospectionOptions,
    IntrospectionResult,
} from 'ra-data-graphql';
import {
    DataProvider,
    Identifier,
    GET_LIST,
    GET_ONE,
    GET_MANY,
    GET_MANY_REFERENCE,
    CREATE,
    UPDATE,
    DELETE,
} from 'ra-core';

import defaultBuildQuery from './buildQuery';
import {
    FieldNameConventions,
    FieldNameConventionEnum,
} from './fieldNameConventions';

export { FieldNameConventionEnum };

export const buildQuery = defaultBuildQuery;
export { buildQueryFactory } from './buildQuery';
export { default as buildGqlQuery } from './buildGqlQuery';
export { default as buildVariables } from './buildVariables';
export { default as getResponseParser } from './getResponseParser';

const buildIntrospection = (
    fieldNameConvention: FieldNameConventionEnum = FieldNameConventionEnum.CAMEL
) => {
    const introspection = {
        operationNames: {
            [GET_LIST]: resource =>
                FieldNameConventions[fieldNameConvention][GET_LIST](resource),
            [GET_ONE]: resource =>
                FieldNameConventions[fieldNameConvention][GET_ONE](resource),
            [GET_MANY]: resource =>
                FieldNameConventions[fieldNameConvention][GET_MANY](resource),
            [GET_MANY_REFERENCE]: resource =>
                FieldNameConventions[fieldNameConvention][GET_MANY_REFERENCE](
                    resource
                ),
            [CREATE]: resource =>
                FieldNameConventions[fieldNameConvention][CREATE](resource),
            [UPDATE]: resource =>
                FieldNameConventions[fieldNameConvention][UPDATE](resource),
            [DELETE]: resource =>
                FieldNameConventions[fieldNameConvention][DELETE](resource),
        },
        exclude: undefined,
        include: undefined,
    };

    return introspection;
};

export { introspectSchema, IntrospectionOptions, buildIntrospection };

export type DataProviderOptions = Omit<Options, 'buildQuery'> & {
    buildQuery?: BuildQueryFactory;
    fieldNameConvention?: FieldNameConventionEnum;
    resolveIntrospection?: typeof introspectSchema;
};

export default (options: DataProviderOptions = {}): Promise<DataProvider> => {
    const {
        fieldNameConvention = FieldNameConventionEnum.CAMEL,
        ...customOptions
    } = options;

    const dataProviderParams = merge(
        {},
        {
            buildQuery: (introspectionResults: IntrospectionResult) =>
                defaultBuildQuery(introspectionResults, fieldNameConvention),
            introspection: buildIntrospection(fieldNameConvention),
        },
        customOptions
    );

    return buildDataProvider(dataProviderParams).then(defaultDataProvider => {
        return {
            ...defaultDataProvider,
            // This provider does not support multiple deletions so instead we send multiple DELETE requests
            // This can be optimized using the apollo-link-batch-http link
            deleteMany: (resource, params) => {
                const { ids, ...otherParams } = params;
                return Promise.all(
                    ids.map(id =>
                        defaultDataProvider.delete(resource, {
                            id,
                            previousData: null,
                            ...otherParams,
                        })
                    )
                ).then(results => {
                    const data = results.reduce<Identifier[]>(
                        (acc, { data }) => [...acc, data.id],
                        []
                    );

                    return { data };
                });
            },
            // This provider does not support multiple deletions so instead we send multiple UPDATE requests
            // This can be optimized using the apollo-link-batch-http link
            updateMany: (resource, params) => {
                const { ids, data, ...otherParams } = params;
                return Promise.all(
                    ids.map(id =>
                        defaultDataProvider.update(resource, {
                            id,
                            data: data,
                            previousData: null,
                            ...otherParams,
                        })
                    )
                ).then(results => {
                    const data = results.reduce<Identifier[]>(
                        (acc, { data }) => [...acc, data.id],
                        []
                    );

                    return { data };
                });
            },
        };
    });
};

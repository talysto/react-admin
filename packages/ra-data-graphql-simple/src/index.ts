import merge from 'lodash/merge';
import buildDataProvider, {
    BuildQueryFactory,
    Options,
    introspectSchema,
    IntrospectionOptions,
    IntrospectionResult,
    defaultOptions as baseDefaultOptions,
} from 'ra-data-graphql';
import {
    DataProvider,
    Identifier,
    DELETE_MANY,
    GET_LIST,
    GET_ONE,
    GET_MANY,
    GET_MANY_REFERENCE,
    CREATE,
    UPDATE,
    DELETE,
    UPDATE_MANY,
} from 'ra-core';

import defaultBuildQuery from './buildQuery';
import {
    FieldNameConventions,
    FieldNameConventionEnum,
} from './fieldNameConventions';

import { DataProviderExtension, DataProviderExtensions } from './extensions';

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
            [DELETE_MANY]: resource =>
                FieldNameConventions[fieldNameConvention][DELETE_MANY](
                    resource
                ),
            [UPDATE_MANY]: resource =>
                FieldNameConventions[fieldNameConvention][UPDATE_MANY](
                    resource
                ),
        },
        exclude: undefined,
        include: undefined,
    };

    return introspection;
};

export {
    introspectSchema,
    IntrospectionOptions,
    buildIntrospection,
    DataProviderExtensions,
};

export type DataProviderOptions = Omit<Options, 'buildQuery'> & {
    buildQuery?: BuildQueryFactory;
    bulkActionsEnabled?: boolean;
    extensions?: DataProviderExtension[];
    fieldNameConvention?: FieldNameConventionEnum;
    resolveIntrospection?: typeof introspectSchema;
};

export default (options: DataProviderOptions = {}): Promise<DataProvider> => {
    const {
        bulkActionsEnabled = false,
        extensions = [],
        fieldNameConvention = FieldNameConventionEnum.CAMEL,
        ...customOptions
    } = options;
    const defaultOptions = {
        ...baseDefaultOptions,
        buildQuery: (introspectionResults: IntrospectionResult) =>
            defaultBuildQuery(introspectionResults, fieldNameConvention),
        introspection: buildIntrospection(fieldNameConvention),
    };

    const dPOptions = merge({}, defaultOptions, customOptions);

    if (dPOptions.introspection?.operationNames) {
        let operationNames = dPOptions.introspection.operationNames;

        extensions.forEach(({ introspectionOperationNames }) => {
            if (introspectionOperationNames)
                operationNames = merge(
                    operationNames,
                    introspectionOperationNames
                );
        });

        dPOptions.introspection.operationNames = operationNames;
    }

    return buildDataProvider(dPOptions).then(defaultDataProvider => {
        return {
            ...defaultDataProvider,
            // This provider defaults to sending multiple DELETE requests for DELETE_MANY
            // and multiple UPDATE requests for UPDATE_MANY unless bulk actions are enabled
            // This can be optimized using the apollo-link-batch-http link
            ...(bulkActionsEnabled
                ? {}
                : {
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
                  }),
            ...extensions.reduce(
                (acc, { methodFactory, factoryArgs = [] }) => ({
                    ...acc,
                    ...methodFactory(...[defaultDataProvider, ...factoryArgs]),
                }),
                {}
            ),
        };
    });
};

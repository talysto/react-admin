import merge from 'lodash/merge';
import buildDataProvider, { BuildQueryFactory, Options } from 'ra-data-graphql';
import {
    CREATE,
    DELETE,
    DELETE_MANY,
    DataProvider,
    GET_LIST,
    GET_MANY,
    GET_MANY_REFERENCE,
    GET_ONE,
    Identifier,
    UPDATE,
    UPDATE_MANY,
} from 'ra-core';
import pluralize from 'pluralize';

import defaultBuildQuery from './buildQuery';

export const buildQuery = defaultBuildQuery;
export { buildQueryFactory } from './buildQuery';
export { default as buildGqlQuery } from './buildGqlQuery';
export { default as buildVariables } from './buildVariables';
export { default as getResponseParser } from './getResponseParser';

const defaultOptions = {
    buildQuery: defaultBuildQuery,
    bulkActionsEnabled: false,
    introspection: {
        operationNames: {
            [GET_LIST]: resource => `all${pluralize(resource.name)}`,
            [GET_ONE]: resource => `${resource.name}`,
            [GET_MANY]: resource => `all${pluralize(resource.name)}`,
            [GET_MANY_REFERENCE]: resource => `all${pluralize(resource.name)}`,
            [CREATE]: resource => `create${resource.name}`,
            [UPDATE]: resource => `update${resource.name}`,
            [DELETE]: resource => `delete${resource.name}`,
        },
        exclude: undefined,
        include: undefined,
    },
};

export default (
    options: Omit<Options, 'buildQuery'> & {
        buildQuery?: BuildQueryFactory;
        bulkActionsEnabled?: boolean;
    }
): Promise<DataProvider> => {
    const { bulkActionsEnabled, ...dPOptions } = merge(
        {},
        defaultOptions,
        options
    );

    if (bulkActionsEnabled) {
        dPOptions.introspection.operationNames[DELETE_MANY] = resource =>
            `delete${pluralize(resource.name)}`;
        dPOptions.introspection.operationNames[UPDATE_MANY] = resource =>
            `update${pluralize(resource.name)}`;
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
        };
    });
};

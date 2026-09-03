import {Provider} from 'react-redux';

import {store} from '../store';
import Routes from '../Routes';
import {WebMCPProvider} from '../components/mcp/WebMCPProvider';

export default () => (
  <Provider store={store}>
    <WebMCPProvider>
      <Routes />
    </WebMCPProvider>
  </Provider>
);

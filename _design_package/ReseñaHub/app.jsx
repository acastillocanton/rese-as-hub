/* Root composition: artboards inside the design canvas. */
const { DesignCanvas, DCSection, DCArtboard } = window;

function App(){
  return (
    <DesignCanvas
      title="ReseñaHub"
      subtitle="Gestión interna de reseñas por comercial · exploración v1"
      background="#EDEDF0"
    >
      <DCSection id="admin" title="Administrador">
        <DCArtboard id="dashboard" label="01 · Dashboard general" width={1440} height={1024}>
          <AdminDashboard />
        </DCArtboard>
        <DCArtboard id="list" label="02 · Lista de comerciales · invitar" width={1440} height={1024}>
          <SalespeopleList />
        </DCArtboard>
        <DCArtboard id="profile" label="03 · Ficha del comercial" width={1440} height={1024}>
          <SalespersonProfile />
        </DCArtboard>
      </DCSection>

      <DCSection id="comercial" title="Comercial">
        <DCArtboard id="self-view" label="04 · Vista del comercial · escritorio" width={1440} height={1024}>
          <SalespersonSelf />
        </DCArtboard>
        <DCArtboard id="mobile" label="05 · Vista del comercial · móvil" width={580} height={1024}>
          <SalespersonMobile />
        </DCArtboard>
      </DCSection>

      <DCSection id="sistema" title="Sistema">
        <DCArtboard id="verification" label="06 · Verificación silenciosa" width={1440} height={1024}>
          <VerificationScreen />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

Summary: TrustedExtensions for the Application Services Gateway
Name: TrustedExtensions
Version: 1.0.0
Release: 0001
BuildArch: noarch
Group: Development/Libraries
License: Apache-2.0
Packager: F5 DevCentral Community <j.gruber@f5.com>

%description
iControl LX extension to handle extension lifecycle management on trusted TMOS devices

%define APP_DIR /var/config/rest/iapps/%{name}

%prep
cp -r %{main}/src %{_builddir}/%{name}-%{version}

%build
npm prune --production

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT/%{APP_DIR}
cp -r $RPM_BUILD_DIR/%{name}-%{version}/* $RPM_BUILD_ROOT/%{APP_DIR}

%clean
rm -rf ${buildroot}

%files
%defattr(-,root,root)
%{APP_DIR}

%changelog
* Mon Oct 01 2018 iApp Dev <iappsdev@f5.com>
- auto-generated this spec file
